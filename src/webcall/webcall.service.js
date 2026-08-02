const Assistant = require('../core/db/schemas/assistant.model');
const { callExternal } = require('../services/livekit/livekitService');
const getUserWithKey = require('../auth/userAccess');
const findByLocalOrExternalId = require('../core/db/functions/findByLocalOrExternalId');

/**
 * Issue a web-call token for one assistant.
 * `text_only: true` is forwarded to the upstream payload; anything else is a voice call.
 */
const generateWebCallToken = async (data) => {
  const { user_id, assistant_id, metadata, text_only } = data;

  // 1. Validate User & API Key
  const user = await getUserWithKey(user_id);

  // 2. Resolve Assistant ID
  const assistant = await findByLocalOrExternalId(Assistant, assistant_id, user._id, 'external_assistant_id');
  if (!assistant) {
    throw new Error('Assistant not found for this user');
  }

  // 3. Construct External Payload
  const externalPayload = {
    assistant_id: assistant.external_assistant_id,
    metadata: metadata || {}
  };

  // 4. Handle text_only
  if (text_only === true) {
    externalPayload.text_only = true;
  }

  // 5. Hit the External API
  return callExternal(user.api_key, {
    method: 'post',
    path: '/web_call/get_token',
    data: externalPayload,
    fallback: 'External API Error while generating token',
    networkFallback: 'Failed to contact external web call service',
  });
};

module.exports = {
  generateWebCallToken
};
