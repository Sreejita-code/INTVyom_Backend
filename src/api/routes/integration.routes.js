const express = require('express');
const asyncHandler = require('../../core/middleware/asyncHandler');
const integrationService = require('../../integration/integration.service');
const { httpError, mapNotFoundTo404 } = require('./common');

const router = express.Router();

// Store or update provider API key. Validation and unknown-service rejections
// carry their own status — everything else flows through centrally.
router.post('/store', asyncHandler(async (req, res) => {
  const { user_id, service_name, api_key } = req.body || {};

  if (!user_id || !service_name || !api_key) {
    throw httpError(400, 'user_id, service_name, and api_key are required');
  }

  const { integration, resync } = await integrationService.storeApiKey(req.body || {});

  res.status(200).json({
    success: true,
    message: 'Integration API key saved successfully',
    data: {
      service_type: integration.service_type,
      service_name: integration.service_name,
      // Optional: Mask the API key in the response for security
      api_key_preview: `***${integration.api_key.slice(-4)}`
    },
    // Existing assistants using this provider are re-pushed the new key.
    resync
  });
}));

// Retrieve provider API key.
router.get('/get', asyncHandler(async (req, res) => {
  const { user_id, service_name } = req.query;

  if (!user_id || !service_name) {
    throw httpError(400, 'user_id and service_name query parameters are required');
  }

  const result = await integrationService.getApiKey(user_id, service_name).catch(mapNotFoundTo404);

  res.status(200).json({
    success: true,
    data: {
      service_type: result.service_type,
      service_name: result.service_name,
      api_key: result.api_key // Return the full key here so your backend can use it
    }
  });
}));

// Current re-sync job status.
router.get('/resync-status', asyncHandler(async (req, res) => {
  const { user_id, service_name } = req.query;
  if (!user_id || !service_name) {
    throw httpError(400, 'user_id and service_name query parameters are required');
  }

  const job = await integrationService.getResyncStatus(user_id, service_name);
  if (!job) throw httpError(404, 'No re-sync job found for this user and service');

  res.status(200).json({ success: true, data: job });
}));

// Manually (re-)trigger the re-sync for one provider.
router.post('/resync', asyncHandler(async (req, res) => {
  const { user_id, service_name } = req.body || {};
  if (!user_id || !service_name) {
    throw httpError(400, 'user_id and service_name are required');
  }

  const result = await integrationService.startResyncForUser(user_id, service_name);
  res.status(202).json({ success: true, resync: result });
}));

module.exports = router;
