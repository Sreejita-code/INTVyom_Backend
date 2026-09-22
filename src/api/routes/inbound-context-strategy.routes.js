const express = require('express');
const asyncHandler = require('../../core/middleware/asyncHandler');
const strategyService = require('../../inbound-context-strategy/inbound-context-strategy.service');
const { httpError, keepStatus } = require('./common');

const router = express.Router();

// Create strategy. Upstream owns url / header / timeout validation — its status (400 on a
// bad url, 401, ...) passes through; 400 is only the fallback for a status-less failure.
router.post('/create', asyncHandler(async (req, res) => {
  const { name, strategy_name, strategy_config } = req.body || {};

  if (!(name || strategy_name) || !strategy_config || !strategy_config.url) {
    throw httpError(400, 'name and strategy_config (with url) are required');
  }

  // Identity comes from the bearer key, not the payload.
  const result = await strategyService.createStrategy({ ...(req.body || {}), user_id: req.user._id }).catch(keepStatus(400));
  res.status(201).json(result);
}));

// Remaining handlers: 500 is the fallback only when the failure carries no status of its
// own — a 404 from resolve or upstream reaches the caller as a 404.
router.get('/list', asyncHandler(async (req, res) => {
  const result = await strategyService.listStrategies(req.user._id).catch(keepStatus(500));
  res.status(200).json(result);
}));

router.get('/details/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) throw httpError(400, 'strategy ID is required');

  const result = await strategyService.getStrategyDetails(req.user._id, id).catch(keepStatus(500));
  res.status(200).json(result);
}));

router.patch('/update/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = { ...(req.body || {}) };
  delete updateData.user_id;

  if (!id) {
    throw httpError(400, 'strategy ID in params is required');
  }

  const result = await strategyService.updateStrategy(req.user._id, id, updateData).catch(keepStatus(500));
  res.status(200).json(result);
}));

router.delete('/delete/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) throw httpError(400, 'strategy ID is required');

  const result = await strategyService.deleteStrategy(req.user._id, id).catch(keepStatus(500));
  res.status(200).json(result);
}));

module.exports = router;
