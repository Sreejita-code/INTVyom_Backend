const express = require('express');
const router = express.Router();
const sipController = require('./sip.controller');

// Matches: POST /api/sip/create-outbound-trunk
router.post('/create-outbound-trunk', sipController.createOutboundTrunk);
router.get('/list', sipController.list);

module.exports = router;