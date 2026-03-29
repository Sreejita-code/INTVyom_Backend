const express = require('express');
const router = express.Router();
const analyticsController = require('./analytics.controller');

router.get('/dashboard', analyticsController.dashboard);
router.get('/calls/by-assistant', analyticsController.byAssistant);
router.get('/calls/by-phone-number', analyticsController.byPhoneNumber);
router.get('/calls/by-time', analyticsController.byTime);
router.get('/calls/by-service', analyticsController.byService);

module.exports = router;
