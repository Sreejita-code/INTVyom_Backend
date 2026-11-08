const express = require('express');
const { z } = require('zod');
const asyncHandler = require('../../core/middleware/asyncHandler');
const ttsService = require('../../tts/tts.service');
const { httpError } = require('./common');

const router = express.Router();

const TTS_PROVIDERS = ['cartesia', 'sarvam', 'elevenlabs', 'mistral'];

const synthesizeSchema = z.object({
  text: z.string({ error: 'text is required' }).min(1, 'text is required').max(5000, 'text must be at most 5000 characters'),
  assistant_id: z.string().min(1).optional(),
  provider: z.enum(TTS_PROVIDERS).optional(),
  model: z.string().min(1).optional(),
  voice: z.string().min(1).optional(),
  language: z.string().min(1).optional(),
  save_to_library: z.boolean().optional(),
  response_format: z.enum(['audio', 'json']).optional(),
}).passthrough();

const FORWARD_HEADER_PREFIXES = ['x-tts-', 'x-audio-', 'x-estimated-', 'x-pricing-', 'x-provider', 'x-model'];
const FORWARD_HEADERS = new Set(['content-type', 'content-disposition', 'content-length', 'cache-control']);

const copyUpstreamHeaders = (upstreamHeaders, res) => {
  for (const [key, value] of Object.entries(upstreamHeaders || {})) {
    if (value === undefined) continue;
    const lower = key.toLowerCase();
    if (FORWARD_HEADERS.has(lower) || FORWARD_HEADER_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
      res.setHeader(key, value);
    }
  }
};

router.post('/synthesize', asyncHandler(async (req, res) => {
  const parsed = synthesizeSchema.safeParse(req.body || {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const message = issue?.path?.[0] === 'text' ? 'text is required' : (issue?.message || 'Invalid request body');
    throw httpError(400, message);
  }

  const body = parsed.data;
  const providerApiKey = req.get('x-provider-api-key') || undefined;
  const responseFormat = body.response_format || 'audio';

  if (responseFormat === 'json') {
    const result = await ttsService.synthesize(req.user._id, body, { providerApiKey });
    return res.status(200).json(result);
  }

  const upstream = await ttsService.synthesizeStream(req.user._id, { ...body, response_format: 'audio' }, { providerApiKey });
  res.status(upstream.status);
  copyUpstreamHeaders(upstream.headers, res);
  if (upstream.status >= 400 && String(upstream.headers['content-type'] || '').includes('application/json')) {
    // Preserve JSON error body fidelity for streamed error responses.
    upstream.data.pipe(res);
    return;
  }
  upstream.data.pipe(res);
}));

module.exports = router;
