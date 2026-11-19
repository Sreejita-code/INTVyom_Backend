const express = require('express');
const { z } = require('zod');
const asyncHandler = require('../../core/middleware/asyncHandler');
const callService = require('../../call/call.service');
const { downloadExotelRecording, isAllowedExotelRecordingUrl } = require('../../services/exotel/exotelRecordingService');
const { httpError } = require('./common');

const router = express.Router();

const recordingRequestSchema = z.object({
  recording_url: z.string({ error: 'recording_url is required' }).min(1, 'recording_url is required'),
}).passthrough();

// Errors carry proper statuses here (validation 400, not-found 404 from the
// service, upstream rejections passthrough) — previously EVERY failure was
// flattened to a client-facing 400.
router.post('/outbound', asyncHandler(async (req, res) => {
  const { assistant_id, trunk_id, to_number } = req.body || {};

  if (!assistant_id || !trunk_id || !to_number) {
    throw httpError(400, 'assistant_id, trunk_id, and to_number are all required');
  }

  // Identity comes from the bearer key, not the payload.
  const result = await callService.makeOutboundCall({ ...(req.body || {}), user_id: req.user._id });
  res.status(200).json(result);
}));

// Poll the dispatch state of the queue_id returned by POST /outbound.
router.get('/queue/:queue_id', asyncHandler(async (req, res) => {
  const { queue_id } = req.params;

  const result = await callService.getQueueStatus(req.user._id, queue_id);
  res.status(200).json(result);
}));

// Proxy an Exotel recording to the caller. Nothing is stored; the bearer key only gates access.
router.post('/recording', asyncHandler(async (req, res) => {
  const parsed = recordingRequestSchema.safeParse(req.body || {});
  if (!parsed.success) {
    throw httpError(400, parsed.error.issues[0]?.message || 'Invalid request body');
  }

  const { recording_url: recordingUrl } = parsed.data;
  if (!isAllowedExotelRecordingUrl(recordingUrl)) {
    throw httpError(400, 'recording_url must be an HTTPS Exotel recording URL');
  }

  const { audio, mimeType, filename } = await downloadExotelRecording(recordingUrl);
  res.set({
    'Content-Type': mimeType,
    'Content-Length': String(audio.length),
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
  });
  res.status(200).send(audio);
}));

module.exports = router;
