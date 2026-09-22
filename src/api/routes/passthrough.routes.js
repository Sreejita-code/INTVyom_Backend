const express = require('express');
const asyncHandler = require('../../core/middleware/asyncHandler');
const passthroughService = require('../../passthrough/passthrough.service');
// keepStatus, not mapNotFoundTo404: upstream's 400 (non-passthrough trunk, malformed E.164)
// and 422 (validation) are actionable, and flattening them to 500 told the caller their
// own bad request was a server fault. The local "trunk not found" error carries its own 404.
const { httpError, keepStatus } = require('./common');

const router = express.Router();

// Trigger passthrough call (web browser to phone over SIP).
router.post('/passthrough-outbound', asyncHandler(async (req, res) => {
  const { trunk_id, to_number } = req.body || {};
  if (!trunk_id || !to_number) {
    throw httpError(400, 'trunk_id and to_number are required');
  }

  // Identity comes from the bearer key, not the payload.
  const result = await passthroughService.makePassthroughOutboundCall({ ...(req.body || {}), user_id: req.user._id }).catch(keepStatus(500));
  res.status(200).json(result);
}));

// List passthrough call records.
router.get('/call-records', asyncHandler(async (req, res) => {
  // Identity comes from the bearer key, not the payload.
  const result = await passthroughService.getCallRecords({ ...req.query, user_id: req.user._id }).catch(keepStatus(500));
  res.status(200).json(result);
}));

module.exports = router;
