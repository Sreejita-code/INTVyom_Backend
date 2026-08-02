const express = require('express');
const asyncHandler = require('../../core/middleware/asyncHandler');
const inboundService = require('../../inbound/inbound.service');
const { httpError, preserveStatus } = require('./common');

const router = express.Router();

// Assign inbound number — failures historically surfaced as 400.
router.post('/assign', asyncHandler(async (req, res) => {
  const { user_id, assistant_id, service, inbound_config } = req.body || {};

  if (!user_id || !assistant_id || !service || !inbound_config || !inbound_config.phone_number) {
    throw httpError(400, 'user_id, assistant_id, service, and inbound_config (with phone_number) are required');
  }

  const result = await inboundService.assignInbound(req.body || {}).catch(preserveStatus(400));
  res.status(201).json(result);
}));

// All remaining handlers — failures historically surfaced as 500.
router.get('/list', asyncHandler(async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) throw httpError(400, 'user_id query parameter is required');

  const result = await inboundService.listInbound(user_id).catch(preserveStatus(500));
  res.status(200).json(result);
}));

router.patch('/update/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { user_id, ...updateData } = req.body || {};

  if (!user_id || !id) {
    throw httpError(400, 'user_id in body and inbound ID in params are required');
  }

  const result = await inboundService.updateInbound(user_id, id, updateData).catch(preserveStatus(500));
  res.status(200).json(result);
}));

router.post('/detach/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.query.user_id || req.body?.user_id;

  if (!userId || !id) throw httpError(400, 'user_id and inbound ID are required');

  const result = await inboundService.detachInbound(userId, id).catch(preserveStatus(500));
  res.status(200).json(result);
}));

router.delete('/delete/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.query.user_id || req.body?.user_id;

  if (!userId || !id) throw httpError(400, 'user_id and inbound ID are required');

  const result = await inboundService.deleteInbound(userId, id).catch(preserveStatus(500));
  res.status(200).json(result);
}));

module.exports = router;
