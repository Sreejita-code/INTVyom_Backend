const express = require('express');
const asyncHandler = require('../../core/middleware/asyncHandler');
const inboundService = require('../../inbound/inbound.service');
const { httpError, keepStatus } = require('./common');

const router = express.Router();

// Assign inbound number. Upstream statuses pass through — 404 (assistant or strategy not
// found), 409 (number already assigned to an active mapping); 400 is only the fallback.
// inbound_context_strategy_id is optional and accepts a local _id or the external id.
router.post('/assign', asyncHandler(async (req, res) => {
  const { user_id, assistant_id, service, inbound_config } = req.body || {};

  if (!user_id || !assistant_id || !service || !inbound_config || !inbound_config.phone_number) {
    throw httpError(400, 'user_id, assistant_id, service, and inbound_config (with phone_number) are required');
  }

  const result = await inboundService.assignInbound(req.body || {}).catch(keepStatus(400));
  res.status(201).json(result);
}));

// Remaining handlers: 500 is the fallback only when the failure carries no status of its
// own — a 404 from resolve or upstream reaches the caller as a 404.
router.get('/list', asyncHandler(async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) throw httpError(400, 'user_id query parameter is required');

  const result = await inboundService.listInbound(user_id).catch(keepStatus(500));
  res.status(200).json(result);
}));

router.patch('/update/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { user_id, ...updateData } = req.body || {};

  if (!user_id || !id) {
    throw httpError(400, 'user_id in body and inbound ID in params are required');
  }

  const result = await inboundService.updateInbound(user_id, id, updateData).catch(keepStatus(500));
  res.status(200).json(result);
}));

router.post('/detach/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.query.user_id || req.body?.user_id;

  if (!userId || !id) throw httpError(400, 'user_id and inbound ID are required');

  const result = await inboundService.detachInbound(userId, id).catch(keepStatus(500));
  res.status(200).json(result);
}));

router.delete('/delete/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.query.user_id || req.body?.user_id;

  if (!userId || !id) throw httpError(400, 'user_id and inbound ID are required');

  const result = await inboundService.deleteInbound(userId, id).catch(keepStatus(500));
  res.status(200).json(result);
}));

module.exports = router;
