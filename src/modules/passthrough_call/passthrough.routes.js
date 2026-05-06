const express = require('express');
const router = express.Router();

const passthroughController = require('./passthrough.controller');

// Trigger passthrough outbound call
router.post('/passthrough-outbound', passthroughController.outboundCall);

// Get passthrough call records
router.get('/call-records', passthroughController.list);

module.exports = router;
