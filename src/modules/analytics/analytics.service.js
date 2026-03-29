const axios = require('axios');
const https = require('https');
const User = require('../auth/user.model');

const API_BASE = 'https://api-livekit-vyom.indusnettechnologies.com/analytics';

const getAgent = () => new https.Agent({ rejectUnauthorized: false });

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

const proxyAnalyticsRequest = async (path, userId, params = {}) => {
  try {
    const apiKey = await getUserApiKey(userId);
    const response = await axios.get(`${API_BASE}${path}`, {
      params,
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      httpsAgent: getAgent()
    });

    return response.data;
  } catch (error) {
    if (error.response) {
      throw createServiceError(
        error.response.status,
        error.response.data,
        'Failed to fetch analytics data'
      );
    }

    throw createServiceError(
      502,
      { error: 'Failed to contact external analytics service' },
      'Failed to contact external analytics service'
    );
  }
};

module.exports = {
  proxyAnalyticsRequest
};
