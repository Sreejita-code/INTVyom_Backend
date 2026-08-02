const express = require('express');
const asyncHandler = require('../../core/middleware/asyncHandler');
const passthroughService = require('../../passthrough/passthrough.service');
const { httpError, mapNotFoundTo404 } = require('./common');

const router = express.Router();

// Trigger passthrough call (web browser to phone over SIP).
router.post('/passthrough-outbound', asyncHandler(async (req, res) => {
  const { user_id, trunk_id, to_number } = req.body || {};
  if (!user_id || !trunk_id || !to_number) {
    throw httpError(400, 'user_id, trunk_id, and to_number are required');
  }

  const result = await passthroughService.makePassthroughOutboundCall(req.body || {}).catch(mapNotFoundTo404);
  res.status(200).json(result);
}));

// List passthrough call records.
router.get('/call-records', asyncHandler(async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) throw httpError(400, 'user_id is required');

  const result = await passthroughService.getCallRecords(req.query).catch(mapNotFoundTo404);
  res.status(200).json(result);
}));

module.exports = router;
