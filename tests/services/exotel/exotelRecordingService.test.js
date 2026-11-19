const test = require('node:test');
const assert = require('node:assert');
const { after } = require('node:test');
const { Readable } = require('node:stream');

const Settings = require('../../../src/core/config');
const {
  MAX_RECORDING_BYTES,
  ExotelRecordingError,
  isAllowedExotelRecordingUrl,
  sanitizeProviderMessage,
  downloadExotelRecording,
} = require('../../../src/services/exotel/exotelRecordingService');

const RECORDING_URL = 'https://recordings.mum1.exotel.com/exotelrecordings/lokaviveka1m/62d88ab4808bc871aa7800a99e7b1abi.mp3';

const originalKey = Settings.exotelApiKey;
const originalToken = Settings.exotelApiToken;
Settings.exotelApiKey = 'key-123';
Settings.exotelApiToken = 'token-456';
after(() => {
  Settings.exotelApiKey = originalKey;
  Settings.exotelApiToken = originalToken;
});

const audioResponse = ({ bytes = Buffer.from('ID3AUDIO'), contentType = 'audio/mpeg', headers = {} } = {}) => ({
  status: 200,
  ok: true,
  headers: new Headers({ 'content-type': contentType, 'content-length': String(bytes.length), ...headers }),
  body: Readable.toWeb(Readable.from([bytes.slice(0, 3), bytes.slice(3)])),
  text: async () => '',
});

const redirectResponse = (location) => ({
  status: 302,
  ok: false,
  headers: new Headers(location ? { location } : {}),
  body: null,
});

const errorResponse = ({ status, text, headers = {} }) => ({
  status,
  ok: false,
  headers: new Headers(headers),
  body: null,
  text: async () => text,
});

test('the host allowlist accepts Exotel recording hosts only', () => {
  assert.strictEqual(isAllowedExotelRecordingUrl(RECORDING_URL), true);
  assert.strictEqual(isAllowedExotelRecordingUrl('https://recordings.exotel.com/a.mp3'), true);
  assert.strictEqual(isAllowedExotelRecordingUrl('https://recordings.ap-south-1.exotel.com/a.mp3'), true);
  assert.strictEqual(isAllowedExotelRecordingUrl('http://recordings.mum1.exotel.com/a.mp3'), false);
  assert.strictEqual(isAllowedExotelRecordingUrl('https://recordings.mum1.exotel.com.evil.test/a.mp3'), false);
  assert.strictEqual(isAllowedExotelRecordingUrl('https://user:pass@recordings.mum1.exotel.com/a.mp3'), false);
  assert.strictEqual(isAllowedExotelRecordingUrl('https://recordings.mum1.exotel.com:8443/a.mp3'), false);
  assert.strictEqual(isAllowedExotelRecordingUrl('not a url'), false);
});

test('a successful download sends Basic auth and returns audio, mime type and filename', async () => {
  let call;
  const result = await downloadExotelRecording(RECORDING_URL, async (url, options) => {
    call = { url: url.toString(), options };
    return audioResponse();
  });

  assert.deepStrictEqual(result.audio, Buffer.from('ID3AUDIO'));
  assert.strictEqual(result.mimeType, 'audio/mpeg');
  assert.strictEqual(result.filename, '62d88ab4808bc871aa7800a99e7b1abi.mp3');
  assert.strictEqual(call.url, RECORDING_URL);
  assert.strictEqual(
    call.options.headers.Authorization,
    `Basic ${Buffer.from('key-123:token-456').toString('base64')}`,
  );
  assert.strictEqual(call.options.redirect, 'manual');
  assert.strictEqual(call.options.cache, 'no-store');
  assert.ok(call.options.signal);
});

test('redirects are revalidated and followed within the allowed hosts', async () => {
  const seen = [];
  const result = await downloadExotelRecording(RECORDING_URL, async (url) => {
    seen.push(url.toString());
    if (seen.length === 1) {
      return redirectResponse('https://recordings.mum2.exotel.com/exotelrecordings/redirected.mp3');
    }
    return audioResponse({ bytes: Buffer.from('REDIRECTED') });
  });

  assert.strictEqual(seen.length, 2);
  assert.deepStrictEqual(result.audio, Buffer.from('REDIRECTED'));
  assert.strictEqual(result.filename, 'redirected.mp3');
});

test('a redirect to an untrusted host is refused', async () => {
  await assert.rejects(
    downloadExotelRecording(RECORDING_URL, async () => redirectResponse('https://evil.test/steal.mp3')),
    (error) => {
      assert.ok(error instanceof ExotelRecordingError);
      assert.strictEqual(error.status, 502);
      assert.match(error.message, /untrusted host/);
      return true;
    },
  );
});

test('a redirect without a location, or more than three hops, is refused', async () => {
  await assert.rejects(
    downloadExotelRecording(RECORDING_URL, async () => redirectResponse(null)),
    /invalid or exceeded the allowed limit/,
  );

  let hops = 0;
  await assert.rejects(
    downloadExotelRecording(RECORDING_URL, async () => {
      hops += 1;
      return redirectResponse(`https://recordings.mum2.exotel.com/hop${hops}.mp3`);
    }),
    /invalid or exceeded the allowed limit/,
  );
  assert.strictEqual(hops, 4);
});

test('missing credentials fail closed with a server error before any request', async () => {
  Settings.exotelApiKey = '';
  let fetched = false;
  try {
    await assert.rejects(
      downloadExotelRecording(RECORDING_URL, async () => {
        fetched = true;
        return audioResponse();
      }),
      (error) => {
        assert.strictEqual(error.status, 500);
        assert.match(error.message, /credentials are not configured/);
        return true;
      },
    );
  } finally {
    Settings.exotelApiKey = 'key-123';
  }
  assert.strictEqual(fetched, false);
});

test('provider error text is sanitized before it reaches the caller', async () => {
  const body = '<Error><Code>SignatureDoesNotMatch</Code>'
    + '<Message>bad token-456 for key-123 &amp; X-Amz-Signature=TOPSECRET</Message></Error>';
  await assert.rejects(
    downloadExotelRecording(`${RECORDING_URL}?X-Amz-Signature=TOPSECRET`, async () => errorResponse({
      status: 403,
      text: body,
      headers: { 'content-type': 'application/xml', 'x-amz-error-code': 'SignatureDoesNotMatch' },
    })),
    (error) => {
      assert.strictEqual(error.status, 502);
      assert.match(error.message, /HTTP 403/);
      assert.match(error.message, /SignatureDoesNotMatch/);
      assert.doesNotMatch(error.message, /token-456/);
      assert.doesNotMatch(error.message, /key-123/);
      assert.doesNotMatch(error.message, /TOPSECRET/);
      assert.doesNotMatch(error.message, /recordings\.mum1\.exotel\.com/);
      return true;
    },
  );
});

test('a Basic auth header echoed by the provider is redacted', async () => {
  const basic = `Basic ${Buffer.from('key-123:token-456').toString('base64')}`;
  await assert.rejects(
    downloadExotelRecording(RECORDING_URL, async () => errorResponse({
      status: 401,
      text: `Invalid ${basic}`,
      headers: { 'content-type': 'text/plain' },
    })),
    (error) => {
      assert.ok(!error.message.includes(basic));
      assert.ok(!error.message.includes(Buffer.from('key-123:token-456').toString('base64')));
      assert.ok(!error.message.includes('token-456'));
      return true;
    },
  );
});

test('upstream error bodies are capped before they are attached to the error', async () => {
  await assert.rejects(
    downloadExotelRecording(RECORDING_URL, async () => ({
      status: 502,
      ok: false,
      headers: new Headers({ 'content-type': 'text/plain' }),
      body: Readable.toWeb(Readable.from([Buffer.alloc(200 * 1024, 0x41)])),
      text: async () => {
        throw new Error('text() must not be used when a stream is present');
      },
    })),
    (error) => {
      assert.strictEqual(error.status, 502);
      assert.ok(error.message.length < 100_000);
      return true;
    },
  );
});

test('JSON provider errors are understood too', async () => {
  await assert.rejects(
    downloadExotelRecording(RECORDING_URL, async () => errorResponse({
      status: 404,
      text: JSON.stringify({ Code: 'NoSuchKey', message: 'missing file' }),
      headers: { 'content-type': 'application/json' },
    })),
    (error) => {
      assert.match(error.message, /HTTP 404.*NoSuchKey: missing file/);
      return true;
    },
  );
});

test('non-audio content types fall back to audio/mpeg', async () => {
  const result = await downloadExotelRecording(RECORDING_URL, async () => audioResponse({
    contentType: 'text/html; charset=utf-8',
  }));
  assert.strictEqual(result.mimeType, 'audio/mpeg');
});

test('an oversized declared body is refused before it is buffered', async () => {
  await assert.rejects(
    downloadExotelRecording(RECORDING_URL, async () => audioResponse({
      headers: { 'content-length': String(MAX_RECORDING_BYTES + 1) },
    })),
    (error) => {
      assert.strictEqual(error.status, 502);
      assert.match(error.message, /exceeds the 100 MB limit/);
      return true;
    },
  );
});

test('sanitizeProviderMessage removes secrets and flattens control characters', () => {
  const cleaned = sanitizeProviderMessage('bad\r\ntoken-456 \t and secret', ['token-456', 'secret']);
  assert.strictEqual(cleaned, 'bad [redacted] and [redacted]');
});
