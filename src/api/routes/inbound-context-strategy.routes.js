const express = require('express');
const asyncHandler = require('../../core/middleware/asyncHandler');
const strategyService = require('../../inbound-context-strategy/inbound-context-strategy.service');
const { httpError, keepStatus } = require('./common');

const router = express.Router();

// Create strategy. Upstream owns url / header / timeout validation — its status (400 on a
// bad url, 401, ...) passes through; 400 is only the fallback for a status-less failure.
router.post('/create', asyncHandler(async (req, res) => {
  const { user_id, name, strategy_name, strategy_config } = req.body || {};

  if (!user_id || !(name || strategy_name) || !strategy_config || !strategy_config.url) {
    throw httpError(400, 'user_id, name, and strategy_config (with url) are required');
  }

  const result = await strategyService.createStrategy(req.body || {}).catch(keepStatus(400));
  res.status(201).json(result);
}));

// Remaining handlers: 500 is the fallback only when the failure carries no status of its
// own — a 404 from resolve or upstream reaches the caller as a 404.
router.get('/list', asyncHandler(async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) throw httpError(400, 'user_id query parameter is required');

  const result = await strategyService.listStrategies(user_id).catch(keepStatus(500));
  res.status(200).json(result);
}));

router.get('/details/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { user_id } = req.query;

  if (!user_id || !id) throw httpError(400, 'user_id and strategy ID are required');

  const result = await strategyService.getStrategyDetails(user_id, id).catch(keepStatus(500));
  res.status(200).json(result);
}));

router.patch('/update/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { user_id, ...updateData } = req.body || {};

  if (!user_id || !id) {
    throw httpError(400, 'user_id in body and strategy ID in params are required');
  }

  const result = await strategyService.updateStrategy(user_id, id, updateData).catch(keepStatus(500));
  res.status(200).json(result);
}));

router.delete('/delete/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.query.user_id || req.body?.user_id;

  if (!userId || !id) throw httpError(400, 'user_id and strategy ID are required');

  const result = await strategyService.deleteStrategy(userId, id).catch(keepStatus(500));
  res.status(200).json(result);
}));

module.exports = router;
