const express = require('express');
const router = express.Router();
const callController = require('./call.controller');

// Matches: POST /api/call/outbound
router.post('/outbound', callController.outboundCall);

module.exports = router;