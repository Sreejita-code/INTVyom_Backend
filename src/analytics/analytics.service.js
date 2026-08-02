const User = require('../core/db/schemas/user.model');
const { callExternal } = require('../services/livekit/livekitService');

const createServiceError = (status, payload, fallbackMessage) => {
  const error = new Error(payload?.message || fallbackMessage || 'Analytics request failed');
  error.status = status;
  error.payload = payload;
  return error;
};

const getUserApiKey = async (userId) => {
  const user = await User.findById(userId);
  if (!user || !user.api_key) {
    throw createServiceError(400, { error: 'Valid user_id with API key is required' });
  }
  return user.api_key;
};

/**
 * Proxy one analytics endpoint for a user, forwarding the upstream body verbatim.
 * Upstream error bodies are preserved on `err.payload` so the central error handler
 * returns them unchanged (existing clients read those fields).
 * @param {string} path   path under /analytics (e.g. '/dashboard')
 */
const proxyAnalyticsRequest = async (path, userId, params = {}) => {
  const apiKey = await getUserApiKey(userId);

  return callExternal(apiKey, {
    path: `/analytics${path}`,
    params,
    attachPayload: true,
    fallback: 'Failed to fetch analytics data',
    networkFallback: 'Failed to contact external analytics service',
    networkStatus: 502,
  });
};

module.exports = {
  proxyAnalyticsRequest
};
