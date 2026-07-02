const Assistant = require('../assistant/assistant.model');
const { callExternal, getUserWithKey, findByLocalOrExternalId } = require('../shared/remote');

const generateWebCallToken = async (data) => {
  console.log("=== [WebCall Service] Processing Token Request ===");

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
    console.log("[WebCall Service] 'text_only: true' detected. Attaching to external payload.");
    externalPayload.text_only = true;
  } else {
    console.log("[WebCall Service] Standard Voice Web Call detected (text_only is absent or false).");
  }

  console.log("[WebCall Service] Final Payload sending to External API:", JSON.stringify(externalPayload, null, 2));

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
