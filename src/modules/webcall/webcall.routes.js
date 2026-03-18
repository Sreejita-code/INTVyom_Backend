const express = require('express');
const router = express.Router();
const webCallController = require('./webcall.controller');

// Matches: POST /api/web-call/get-token
router.post('/get-token', webCallController.getToken);

module.exports = router;