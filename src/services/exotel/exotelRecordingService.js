'use strict';

const { Readable } = require('node:stream');
const Settings = require('../../core/config');

const MAX_RECORDING_BYTES = 100 * 1024 * 1024;
const MAX_ERROR_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const EXOTEL_RECORDING_HOST = /^recordings(?:\.[a-z0-9-]+)?\.exotel\.com$/i;
const MIME_TYPE = /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/;

class ExotelRecordingError extends Error {
  constructor(message, status = 502, code = 'exotel_recording_failed') {
    super(message);
    this.name = 'ExotelRecordingError';
    this.status = status;
    this.code = code;
  }
}

const isAllowedExotelRecordingUrl = (value) => {
  let url = value;
  if (typeof value === 'string') {
    try {
      url = new URL(value);
    } catch {
      return false;
    }
  }
  if (!(url instanceof URL)) return false;

  return url.protocol === 'https:'
    && url.port === ''
    && url.username === ''
    && url.password === ''
    && EXOTEL_RECORDING_HOST.test(url.hostname);
};

// Provider error bodies are echoed to the caller. Strip anything that could be a signed URL
// token or a credential before they reach the response (or the 5xx log line).
const sanitizeProviderMessage = (message, secrets) => {
  let text = String(message ?? '');
  for (const secret of secrets) {
    if (typeof secret !== 'string' || secret.length === 0) continue;
    for (const value of new Set([secret, encodeURIComponent(secret)])) {
      if (value.length === 0) continue;
      text = text.split(value).join('[redacted]');
    }
  }
  return text.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
};

const getXmlField = (text, field) => {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(
    new RegExp(`<(?:[\\w.-]+:)?${escaped}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${escaped}\\s*>`, 'i'),
  );
  if (!match) return '';
  return match[1]
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .trim();
};

const getProviderDetail = (responseText, headers, urls, authorization) => {
  let json = {};
  try {
    const parsed = JSON.parse(responseText);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) json = parsed;
  } catch {
    json = {}; // XML or plain-text error body
  }

  const code = headers.get('x-amz-error-code')
    || getXmlField(responseText, 'Code')
    || (typeof json.Code === 'string' ? json.Code : '');
  const message = getXmlField(responseText, 'Message')
    || (typeof json.Message === 'string' ? json.Message : '')
    || (typeof json.message === 'string' ? json.message : '');
  // Short query values (e.g. ?v=1) would redact every "1" in the message, so only scrub
  // values long enough to be a real token. Credentials are always scrubbed, however short.
  const queryValues = urls.flatMap((value) => [...new URL(value).searchParams.values()])
    .filter((value) => value.length >= 8);

  return sanitizeProviderMessage([code, message].filter(Boolean).join(': '), [
    Settings.exotelApiKey,
    Settings.exotelApiToken,
    authorization,
    authorization.split(' ')[1],
    ...urls,
    ...queryValues,
  ]);
};

const getResponseMimeType = (headers) => {
  const raw = (headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!MIME_TYPE.test(raw)) return 'audio/mpeg';
  if (raw.startsWith('audio/') || raw === 'application/octet-stream') return raw;
  return 'audio/mpeg';
};

const tooLargeError = () => new ExotelRecordingError(
  `The Exotel recording exceeds the ${MAX_RECORDING_BYTES / (1024 * 1024)} MB limit.`,
  502,
  'recording_too_large',
);

const readRecordingBody = async (response) => {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_RECORDING_BYTES) throw tooLargeError();

  if (!response.body || typeof response.body.getReader !== 'function') {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_RECORDING_BYTES) throw tooLargeError();
    return buffer;
  }

  const stream = Readable.fromWeb(response.body);
  const chunks = [];
  let total = 0;
  try {
    for await (const chunk of stream) {
      const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += part.length;
      if (total > MAX_RECORDING_BYTES) throw tooLargeError();
      chunks.push(part);
    }
  } finally {
    stream.destroy();
  }
  return Buffer.concat(chunks, total);
};

// Error bodies are diagnostic only. Cap them so a misbehaving upstream cannot force a large
// allocation before the text is sanitized and attached to the 502.
const readErrorText = async (response) => {
  if (!response.body || typeof response.body.getReader !== 'function') {
    return (await response.text()).slice(0, MAX_ERROR_BYTES);
  }

  const stream = Readable.fromWeb(response.body);
  const chunks = [];
  let total = 0;
  try {
    for await (const chunk of stream) {
      const remaining = MAX_ERROR_BYTES - total;
      if (remaining <= 0) break;
      const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunks.push(part.subarray(0, remaining));
      total += Math.min(part.length, remaining);
    }
  } finally {
    stream.destroy();
  }
  return Buffer.concat(chunks, total).toString('utf8');
};

const recordingFilename = (url, mimeType) => {
  let raw = '';
  try {
    raw = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '');
  } catch {
    raw = '';
  }
  let name = raw.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+|\.+$/g, '').slice(0, 120);
  if (!name) name = 'recording';
  if (!/\.[A-Za-z0-9]{1,8}$/.test(name)) {
    if (mimeType === 'audio/wav' || mimeType === 'audio/x-wav') name += '.wav';
    else if (mimeType === 'audio/ogg') name += '.ogg';
    else name += '.mp3';
  }
  return name;
};

/**
 * Fetch an Exotel recording and return its bytes. Nothing is persisted.
 *
 * `fetchImpl` is injectable so the suite can exercise redirects and provider errors offline.
 */
const downloadExotelRecording = async (recordingUrl, fetchImpl = globalThis.fetch) => {
  if (!isAllowedExotelRecordingUrl(recordingUrl)) {
    throw new ExotelRecordingError(
      'The recording URL is not an allowed HTTPS Exotel recording URL.',
      400,
      'invalid_recording_url',
    );
  }

  const { exotelApiKey: apiKey, exotelApiToken: apiToken } = Settings;
  if (!apiKey || !apiToken) {
    throw new ExotelRecordingError(
      'Telephony credentials are not configured for recording retrieval.',
      500,
      'credentials_missing',
    );
  }
  const authorization = `Basic ${Buffer.from(`${apiKey}:${apiToken}`).toString('base64')}`;
  const originalUrl = new URL(recordingUrl);
  let url = originalUrl;

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await fetchImpl(url, {
      headers: { Authorization: authorization },
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    });

    if (!REDIRECT_STATUSES.has(response.status)) {
      if (!response.ok) {
        const responseText = await readErrorText(response);
        const urls = [...new Set([recordingUrl, url.toString()])];
        const detail = getProviderDetail(responseText, response.headers, urls, authorization);
        const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        const diagnostics = [MIME_TYPE.test(contentType) ? contentType : '', detail].filter(Boolean).join('; ');
        throw new ExotelRecordingError(
          `The recording provider returned HTTP ${response.status}${diagnostics ? ` (${diagnostics})` : ''}.`,
          502,
          'provider_error',
        );
      }

      const mimeType = getResponseMimeType(response.headers);
      return {
        audio: await readRecordingBody(response),
        mimeType,
        filename: recordingFilename(url, mimeType),
      };
    }

    const location = response.headers.get('location');
    if (!location || redirects === MAX_REDIRECTS) {
      throw new ExotelRecordingError(
        'The Exotel recording redirect was invalid or exceeded the allowed limit.',
        502,
        'invalid_redirect',
      );
    }

    let redirectedUrl;
    try {
      redirectedUrl = new URL(location, url);
    } catch {
      redirectedUrl = null;
    }
    if (!isAllowedExotelRecordingUrl(redirectedUrl)) {
      throw new ExotelRecordingError('The Exotel recording redirected to an untrusted host.', 502, 'untrusted_redirect');
    }
    url = redirectedUrl;
  }

  throw new ExotelRecordingError('The Exotel recording redirect could not be followed.', 502, 'invalid_redirect');
};

module.exports = {
  MAX_RECORDING_BYTES,
  ExotelRecordingError,
  isAllowedExotelRecordingUrl,
  sanitizeProviderMessage,
  downloadExotelRecording,
};
