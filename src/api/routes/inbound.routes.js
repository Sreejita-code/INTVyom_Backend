const express = require('express');
const asyncHandler = require('../../core/middleware/asyncHandler');
const inboundService = require('../../inbound/inbound.service');
const { httpError, keepStatus } = require('./common');

const router = express.Router();

// Assign inbound number. Upstream statuses pass through — 404 (assistant or strategy not
// found), 409 (number already assigned to an active mapping); 400 is only the fallback.
// inbound_context_strategy_id is optional and accepts a local _id or the external id.
router.post('/assign', asyncHandler(async (req, res) => {
  const { assistant_id, service, inbound_config } = req.body || {};

  if (!assistant_id || !service || !inbound_config || !inbound_config.phone_number) {
    throw httpError(400, 'assistant_id, service, and inbound_config (with phone_number) are required');
  }

  // Identity comes from the bearer key, not the payload.
  const result = await inboundService.assignInbound({ ...(req.body || {}), user_id: req.user._id }).catch(keepStatus(400));
  res.status(201).json(result);
}));

// Remaining handlers: 500 is the fallback only when the failure carries no status of its
// own — a 404 from resolve or upstream reaches the caller as a 404.
router.get('/list', asyncHandler(async (req, res) => {
  const result = await inboundService.listInbound(req.user._id).catch(keepStatus(500));
  res.status(200).json(result);
}));

router.patch('/update/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = { ...(req.body || {}) };
  delete updateData.user_id;

  if (!id) {
    throw httpError(400, 'inbound ID in params is required');
  }

  const result = await inboundService.updateInbound(req.user._id, id, updateData).catch(keepStatus(500));
  res.status(200).json(result);
}));

router.post('/detach/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) throw httpError(400, 'inbound ID is required');

  const result = await inboundService.detachInbound(req.user._id, id).catch(keepStatus(500));
  res.status(200).json(result);
}));

router.delete('/delete/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) throw httpError(400, 'inbound ID is required');

  const result = await inboundService.deleteInbound(req.user._id, id).catch(keepStatus(500));
  res.status(200).json(result);
}));

module.exports = router;
