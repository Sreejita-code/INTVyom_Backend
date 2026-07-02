const express = require('express');
const router = express.Router();
const integrationController = require('./integration.controller');

// Matches: POST /api/integration/store
router.post('/store', integrationController.store);

// Matches: GET /api/integration/get?user_id=123&service_name=sarvam
router.get('/get', integrationController.get);

// Matches: GET /api/integration/resync-status?user_id=123&service_name=openai
router.get('/resync-status', integrationController.resyncStatus);

// Matches: POST /api/integration/resync  (body: user_id, service_name)
router.post('/resync', integrationController.resync);

module.exports = router;