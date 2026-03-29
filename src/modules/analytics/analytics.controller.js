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

const getUserId = (req) => req.query.user_id;

const validateUserId = (userId, res) => {
  if (!userId) {
    res.status(400).json({ error: 'user_id query parameter is required' });
    return false;
  }
  return true;
};

const dashboard = async (req, res) => {
  const userId = getUserId(req);
  if (!validateUserId(userId, res)) return;

  return handleAnalyticsRequest(res, () =>
    analyticsService.proxyAnalyticsRequest(
      '/dashboard',
      userId,
      pickQueryParams(req.query, ['start_date', 'end_date'])
    )
  );
};

const byAssistant = async (req, res) => {
  const userId = getUserId(req);
  if (!validateUserId(userId, res)) return;

  return handleAnalyticsRequest(res, () =>
    analyticsService.proxyAnalyticsRequest(
      '/calls/by-assistant',
      userId,
      pickQueryParams(req.query, ['start_date', 'end_date'])
    )
  );
};

const byPhoneNumber = async (req, res) => {
  const userId = getUserId(req);
  if (!validateUserId(userId, res)) return;

  return handleAnalyticsRequest(res, () =>
    analyticsService.proxyAnalyticsRequest(
      '/calls/by-phone-number',
      userId,
      pickQueryParams(req.query, ['start_date', 'end_date', 'assistant_id'])
    )
  );
};

const byTime = async (req, res) => {
  const userId = getUserId(req);
  if (!validateUserId(userId, res)) return;

  return handleAnalyticsRequest(res, () =>
    analyticsService.proxyAnalyticsRequest(
      '/calls/by-time',
      userId,
      pickQueryParams(req.query, ['start_date', 'end_date', 'granularity', 'assistant_id'])
    )
  );
};

const byService = async (req, res) => {
  const userId = getUserId(req);
  if (!validateUserId(userId, res)) return;

  return handleAnalyticsRequest(res, () =>
    analyticsService.proxyAnalyticsRequest(
      '/calls/by-service',
      userId,
      pickQueryParams(req.query, ['start_date', 'end_date'])
    )
  );
};

module.exports = {
  dashboard,
  byAssistant,
  byPhoneNumber,
  byTime,
  byService
};
