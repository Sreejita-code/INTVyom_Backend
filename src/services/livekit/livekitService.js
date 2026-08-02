const axios = require('axios');
const https = require('https');
const Settings = require('../../core/config');

// External API shares one base host across every module. Override per environment with
// EXTERNAL_API_BASE (staging, a local mock); the production host stays the default.
const EXTERNAL_BASE = Settings.externalApiBase;

// One reusable TLS agent (external cert isn't verified). Stateless — no need to
// allocate a fresh https.Agent per request. ponytail: fine as a shared const.
const agent = new https.Agent({ rejectUnauthorized: false });

/**
 * Call the external LiveKit-Vyom API and return response.data.
 * @param {string|null} apiKey       user.api_key, sent as Bearer token. Pass null for
 *                                   the unauthenticated endpoints (key issuance).
 * @param {object} opts
 *   path            path appended to EXTERNAL_BASE (e.g. '/tool/create')
 *   method          http verb (default 'get')
 *   data            request body (objects auto-serialize; pass a FormData for uploads)
 *   params          query params
 *   headers         extra headers merged over the Authorization header
 *   fallback        message when server responds with an error but no data.message
 *   networkFallback message when the request never reached the server
 *   networkStatus   status for a request that never reached the server (default: none,
 *                   so the central handler treats it as a 500)
 *   attachPayload   true → carry the upstream error body on `err.payload`, which the
 *                   central error handler returns verbatim (analytics passthrough)
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
    networkStatus,
    attachPayload = false,
    extractMessage,
  }
) => {
  try {
    const response = await axios({
      method,
      url: `${EXTERNAL_BASE}${path}`,
      ...(data !== undefined && { data }),
      ...(params !== undefined && { params }),
      // Authorization last: a caller-supplied header must not be able to clobber the token.
      headers: { ...headers, ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
      httpsAgent: agent,
    });
    return response.data;
  } catch (error) {
    if (error.response) {
      const wrapped = new Error(
        extractMessage
          ? extractMessage(error.response.data)
          : error.response.data?.message || fallback
      );
      // Carry the upstream status so controllers can pass a 400/404/422 straight through
      // instead of flattening every external rejection into a 500.
      wrapped.status = error.response.status;
      if (attachPayload) wrapped.payload = error.response.data;
      throw wrapped;
    }
    // Network failures carry no status by default — callers fall back to 500.
    const wrapped = new Error(networkFallback);
    if (networkStatus) wrapped.status = networkStatus;
    if (attachPayload) wrapped.payload = { error: networkFallback };
    throw wrapped;
  }
};

module.exports = { EXTERNAL_BASE, callExternal };
