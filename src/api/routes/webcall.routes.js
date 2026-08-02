const express = require('express');
const asyncHandler = require('../../core/middleware/asyncHandler');
const webCallService = require('../../webcall/webcall.service');
const { httpError, mapNotFoundTo404 } = require('./common');

const router = express.Router();

// Generate web call token (AI agent call).
router.post('/get-token', asyncHandler(async (req, res) => {
  const { user_id, assistant_id } = req.body || {};

  if (!user_id || !assistant_id) {
    throw httpError(400, 'user_id and assistant_id are required');
  }

  const result = await webCallService.generateWebCallToken(req.body || {}).catch(mapNotFoundTo404);
  res.status(200).json(result);
}));

module.exports = router;
