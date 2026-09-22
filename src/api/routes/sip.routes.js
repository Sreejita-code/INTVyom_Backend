const express = require('express');
const asyncHandler = require('../../core/middleware/asyncHandler');
const sipService = require('../../sip/sip.service');
const { httpError, preserveStatus } = require('./common');

const router = express.Router();

// Create outbound trunk — failures historically surfaced as 400.
router.post('/create-outbound-trunk', asyncHandler(async (req, res) => {
  const { trunk_name, trunk_type, trunk_config } = req.body || {};

  if (!trunk_name || !trunk_type || !trunk_config) {
    throw httpError(400, 'trunk_name, trunk_type, and trunk_config are required');
  }

  // Identity comes from the bearer key, not the payload.
  const trunk = await sipService.createOutboundTrunk({ ...(req.body || {}), user_id: req.user._id }).catch(preserveStatus(400));
  res.status(201).json({
    message: 'Outbound trunk created successfully locally and externally',
    trunk
  });
}));

// List trunks — failures historically surfaced as 500.
router.get('/list', asyncHandler(async (req, res) => {
  const result = await sipService.listSipTrunks(req.user._id).catch(preserveStatus(500));
  res.status(200).json(result);
}));

// Trunk details — failures historically surfaced as 404.
router.get('/details/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) throw httpError(400, 'Trunk ID is required');

  const result = await sipService.getSipTrunkDetails(req.user._id, id).catch(preserveStatus(404));
  res.status(200).json(result);
}));

// Delete trunk — failures historically surfaced as 500.
router.delete('/delete/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) throw httpError(400, 'Trunk ID is required');

  const result = await sipService.deleteSipTrunk(req.user._id, id).catch(preserveStatus(500));
  res.status(200).json(result);
}));

module.exports = router;
