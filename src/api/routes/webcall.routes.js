const express = require('express');
const asyncHandler = require('../../core/middleware/asyncHandler');
const webCallService = require('../../webcall/webcall.service');
// keepStatus, not mapNotFoundTo404: upstream answers 400 when text_only is requested on a
// realtime assistant (there is no text path there) and 422 on validation. Both are the
// caller's to fix, so flattening them to 500 hid the actual problem.
const { httpError, keepStatus } = require('./common');

const router = express.Router();

// Generate web call token (AI agent call).
router.post('/get-token', asyncHandler(async (req, res) => {
  const { assistant_id } = req.body || {};

  if (!assistant_id) {
    throw httpError(400, 'assistant_id is required');
  }

  // Identity comes from the bearer key, not the payload.
  const result = await webCallService.generateWebCallToken({ ...(req.body || {}), user_id: req.user._id }).catch(keepStatus(500));
  res.status(200).json(result);
}));

module.exports = router;
