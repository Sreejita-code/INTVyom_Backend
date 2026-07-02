const SipTrunk = require('../sip/sip.model');
const { callExternal, getUserWithKey, findByLocalOrExternalId } = require('../shared/remote');

const makePassthroughOutboundCall = async (data) => {
  const { user_id, trunk_id, to_number, metadata } = data;

  const user = await getUserWithKey(user_id);

  const trunk = await findByLocalOrExternalId(
    SipTrunk, trunk_id, user._id, 'external_trunk_id', { passthrough_mode: true }
  );
  if (!trunk) throw new Error('Passthrough trunk not found for this user. Ensure trunk was created with passthrough_mode: true.');

  const externalPayload = {
    trunk_id: trunk.external_trunk_id,
    to_number,
    ...(metadata && { metadata })
  };

  return callExternal(user.api_key, {
    method: 'post',
    path: '/call/outbound_passthrough',
    data: externalPayload,
    fallback: 'External API Error while triggering call',
    networkFallback: 'Failed to contact external call service',
  });
};

const getCallRecords = async (data) => {
  const { user_id, to_number, call_status, start_date, end_date, limit, offset } = data;

  const user = await getUserWithKey(user_id);

  const params = { passthrough_only: true };
  if (to_number) params.to_number = to_number;
  if (call_status) params.call_status = call_status;
  if (start_date) params.start_date = start_date;
  if (end_date) params.end_date = end_date;
  if (limit) params.limit = limit;
  if (offset) params.offset = offset;

  return callExternal(user.api_key, {
    method: 'get',
    path: '/call/records',
    params,
    fallback: 'External API Error while fetching records',
    networkFallback: 'Failed to contact external call service',
  });
};

module.exports = {
  makePassthroughOutboundCall,
  getCallRecords
};
