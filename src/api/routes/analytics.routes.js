const express = require('express');
const asyncHandler = require('../../core/middleware/asyncHandler');
const analyticsService = require('../../analytics/analytics.service');

const router = express.Router();

// Each handler differs only by external path + which query params it forwards.
// Errors carry status + payload from analyticsService and are shaped centrally.
const pickQueryParams = (query, allowedKeys) => {
  const params = {};
  for (const key of allowedKeys) {
    if (query[key] !== undefined) params[key] = query[key];
  }
  return params;
};

const ROUTES = {
  dashboard:     ['/dashboard',             ['start_date', 'end_date']],
  byAssistant:   ['/calls/by-assistant',    ['start_date', 'end_date']],
  byPhoneNumber: ['/calls/by-phone-number', ['start_date', 'end_date', 'assistant_id']],
  byTime:        ['/calls/by-time',         ['start_date', 'end_date', 'granularity', 'assistant_id']],
  byService:     ['/calls/by-service',      ['start_date', 'end_date']],
};

const makeHandler = ([path, keys]) => asyncHandler(async (req, res) => {
  // Identity comes from the bearer key. pickQueryParams only forwards the allowed keys, so a
  // user_id in the query string is never passed upstream.
  const result = await analyticsService.proxyAnalyticsRequest(path, req.user._id, pickQueryParams(req.query, keys));
  res.status(200).json(result);
});

router.get('/dashboard', makeHandler(ROUTES.dashboard));
router.get('/calls/by-assistant', makeHandler(ROUTES.byAssistant));
router.get('/calls/by-phone-number', makeHandler(ROUTES.byPhoneNumber));
router.get('/calls/by-time', makeHandler(ROUTES.byTime));
router.get('/calls/by-service', makeHandler(ROUTES.byService));

module.exports = router;
