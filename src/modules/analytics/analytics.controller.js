const analyticsService = require('./analytics.service');

const pickQueryParams = (query, allowedKeys) => {
  const params = {};

  for (const key of allowedKeys) {
    if (query[key] !== undefined) {
      params[key] = query[key];
    }
  }

  return params;
};

const handleAnalyticsRequest = async (res, fetcher) => {
  try {
    const result = await fetcher();
    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    if (error.payload) {
      return res.status(status).json(error.payload);
    }
    return res.status(status).json({ error: error.message });
  }
};

// Each handler differs only by external path + which query params it forwards.
const ROUTES = {
  dashboard:     ['/dashboard',             ['start_date', 'end_date']],
  byAssistant:   ['/calls/by-assistant',    ['start_date', 'end_date']],
  byPhoneNumber: ['/calls/by-phone-number', ['start_date', 'end_date', 'assistant_id']],
  byTime:        ['/calls/by-time',         ['start_date', 'end_date', 'granularity', 'assistant_id']],
  byService:     ['/calls/by-service',      ['start_date', 'end_date']],
};

const makeHandler = ([path, keys]) => async (req, res) => {
  const userId = req.query.user_id;
  if (!userId) return res.status(400).json({ error: 'user_id query parameter is required' });

  return handleAnalyticsRequest(res, () =>
    analyticsService.proxyAnalyticsRequest(path, userId, pickQueryParams(req.query, keys))
  );
};

module.exports = Object.fromEntries(
  Object.entries(ROUTES).map(([name, cfg]) => [name, makeHandler(cfg)])
);
