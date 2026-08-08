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

/**
 * Dispatch state of a queued outbound call. `POST /call/outbound` returns a `queue_id`
 * and nothing else, so without this the caller has an identifier they cannot resolve.
 *
 * `dispatched` only means the handoff to the telephony provider succeeded — the live call
 * outcome (`answered`, `busy`, `no_answer`, ...) arrives via the end-call webhook or the
 * assistant call logs, not here.
 */
const getQueueStatus = async (userId, queueId) => {
  const user = await getUserWithKey(userId);

  return callExternal(user.api_key, {
    path: `/call/queue/${queueId}`,
    fallback: 'Failed to fetch queue status',
    networkFallback: 'Failed to contact external call service',
  });
};

module.exports = {
  makeOutboundCall,
  getQueueStatus
};
