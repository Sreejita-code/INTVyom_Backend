const express = require('express');
const asyncHandler = require('../../core/middleware/asyncHandler');
const callService = require('../../call/call.service');
const { httpError } = require('./common');

const router = express.Router();

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

module.exports = router;
