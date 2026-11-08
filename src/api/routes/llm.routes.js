const express = require('express');
const { z } = require('zod');
const asyncHandler = require('../../core/middleware/asyncHandler');
const llmService = require('../../llm/llm.service');
const { httpError } = require('./common');

const router = express.Router();

const messageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
}).passthrough();

const chatSchema = z.object({
  messages: z.array(messageSchema).min(1, 'messages must contain at least one message'),
  assistant_id: z.string().min(1).optional(),
  provider: z.enum(['openai', 'gemini']).optional(),
  model: z.string().min(1).optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
  stream: z.boolean().optional(),
}).passthrough();

const copyStreamHeaders = (upstreamHeaders, res) => {
  const contentType = upstreamHeaders?.['content-type'];
  if (contentType) res.setHeader('Content-Type', contentType);
  const cacheControl = upstreamHeaders?.['cache-control'];
  if (cacheControl) res.setHeader('Cache-Control', cacheControl);
  // Prevent buffering by common reverse proxies for SSE.
  if (String(contentType || '').includes('text/event-stream')) {
    res.setHeader('Cache-Control', cacheControl || 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
  }
};

router.post('/chat', asyncHandler(async (req, res) => {
  const parsed = chatSchema.safeParse(req.body || {});
  if (!parsed.success) {
    throw httpError(400, parsed.error.issues[0]?.message || 'Invalid request body');
  }

  const body = parsed.data;
  const providerApiKey = req.get('x-provider-api-key') || undefined;

  if (!body.stream) {
    const result = await llmService.chat(req.user._id, body, { providerApiKey });
    return res.status(200).json(result);
  }

  const upstream = await llmService.chatStream(req.user._id, { ...body, stream: true }, { providerApiKey });
  res.status(upstream.status);
  copyStreamHeaders(upstream.headers, res);
  upstream.data.pipe(res);
}));

module.exports = router;
