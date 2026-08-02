const express = require('express');
const asyncHandler = require('../../core/middleware/asyncHandler');
const callService = require('../../call/call.service');
const { httpError } = require('./common');

const router = express.Router();

// Errors carry proper statuses here (validation 400, not-found 404 from the
// service, upstream rejections passthrough) — previously EVERY failure was
// flattened to a client-facing 400.
router.post('/outbound', asyncHandler(async (req, res) => {
  const { user_id, assistant_id, trunk_id, to_number } = req.body || {};

  if (!user_id || !assistant_id || !trunk_id || !to_number) {
    throw httpError(400, 'user_id, assistant_id, trunk_id, and to_number are all required');
  }

  const result = await callService.makeOutboundCall(req.body || {});
  res.status(200).json(result);
}));

module.exports = router;
