const axios = require('axios');
const https = require('https');
const User = require('../auth/user.model');

// External API shares one base host across every module.
const EXTERNAL_BASE = 'https://api-livekit-vyom.indusnettechnologies.com';

// One reusable TLS agent (external cert isn't verified). Stateless — no need to
// allocate a fresh https.Agent per request. ponytail: fine as a shared const.
const agent = new https.Agent({ rejectUnauthorized: false });

/**
 * Call the external LiveKit-Vyom API and return response.data.
 * @param {string} apiKey            user.api_key, sent as Bearer token
 * @param {object} opts
 *   path            path appended to EXTERNAL_BASE (e.g. '/tool/create')
 *   method          http verb (default 'get')
 *   data            request body (objects auto-serialize; pass a FormData for uploads)
 *   params          query params
 *   headers         extra headers merged over the Authorization header
 *   fallback        message when server responds with an error but no data.message
 *   networkFallback message when the request never reached the server
 *   extractMessage  optional (responseData) => string, for endpoints that return
 *                   an error under a different key than `message`
 */
const callExternal = async (
  apiKey,
  {
    path,
    method = 'get',
    data,
    params,
    headers = {},
    fallback = 'External API Error',
    networkFallback = 'Failed to contact external service',
    extractMessage,
  }
) => {
  try {
    const response = await axios({
      method,
      url: `${EXTERNAL_BASE}${path}`,
      ...(data !== undefined && { data }),
      ...(params !== undefined && { params }),
      headers: { Authorization: `Bearer ${apiKey}`, ...headers },
      httpsAgent: agent,
    });
    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(
        extractMessage
          ? extractMessage(error.response.data)
          : error.response.data.message || fallback
      );
    }
    throw new Error(networkFallback);
  }
};

// Load a user and require they have an API key (the guard duplicated across services).
const getUserWithKey = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');
  if (!user.api_key) throw new Error('User does not have an API Key. Please generate one first.');
  return user;
};

// Resolve a document by local Mongo _id OR its external id field, scoped to a user.
// Keeps the strict 24-hex check so a non-ObjectId string only matches the external field.
const findByLocalOrExternalId = (Model, id, userId, extField, extra = {}) =>
  Model.findOne({
    $or: [
      { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null },
      { [extField]: id },
    ],
    user_id: userId,
    ...extra,
  });

module.exports = { EXTERNAL_BASE, callExternal, getUserWithKey, findByLocalOrExternalId };
