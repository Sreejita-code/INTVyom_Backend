const SipTrunk = require('../core/db/schemas/sip.model');
const Assistant = require('../core/db/schemas/assistant.model');
const { callExternal } = require('../services/livekit/livekitService');
const getUserWithKey = require('../auth/userAccess');
const findByLocalOrExternalId = require('../core/db/functions/findByLocalOrExternalId');

const makeOutboundCall = async (data) => {
  const { user_id, assistant_id, trunk_id, to_number, metadata } = data;

  // 1. Validate User & API Key
  const user = await getUserWithKey(user_id);

  // 2. Fetch the SIP Trunk to determine call_service (twilio or exotel)
  // Supports passing either the local MongoDB _id or the external_trunk_id
  const trunk = await findByLocalOrExternalId(SipTrunk, trunk_id, user._id, 'external_trunk_id');
  if (!trunk) {
    const error = new Error('SIP Trunk not found for this user. Please provide a valid trunk ID.');
    error.status = 404;
    throw error;
  }

  // 3. Fetch the Assistant to get the correct external_assistant_id
  const assistant = await findByLocalOrExternalId(Assistant, assistant_id, user._id, 'external_assistant_id');
  if (!assistant) {
    const error = new Error('Assistant not found for this user. Please provide a valid assistant ID.');
    error.status = 404;
    throw error;
  }

  // 4. Construct payload for the external API
  const externalPayload = {
    assistant_id: assistant.external_assistant_id,
    trunk_id: trunk.external_trunk_id,
    to_number: to_number,
    call_service: trunk.trunk_type,
    ...(metadata && { metadata })
  };

  // 5. Call External API
  return callExternal(user.api_key, {
    method: 'post',
    path: '/call/outbound',
    data: externalPayload,
    fallback: 'Failed to trigger outbound call externally',
    networkFallback: 'Failed to contact external call service',
  });
};

module.exports = {
  makeOutboundCall
};
