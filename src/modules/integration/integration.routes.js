const express = require('express');
const router = express.Router();
const integrationController = require('./integration.controller');

// Matches: POST /api/integration/store
router.post('/store', integrationController.store);

// Matches: GET /api/integration/get?user_id=123&service_name=sarvam
router.get('/get', integrationController.get);

module.exports = router;