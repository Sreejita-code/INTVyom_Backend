const SipTrunk = require('../core/db/schemas/sip.model');
const { callExternal } = require('../services/livekit/livekitService');
const getUserWithKey = require('../auth/userAccess');
const findByLocalOrExternalId = require('../core/db/functions/findByLocalOrExternalId');

const makePassthroughOutboundCall = async (data) => {
  const { user_id, trunk_id, to_number, metadata } = data;

  const user = await getUserWithKey(user_id);

  const trunk = await findByLocalOrExternalId(
    SipTrunk, trunk_id, user._id, 'external_trunk_id', { passthrough_mode: true }
  );
  if (!trunk) {
    const error = new Error('Passthrough trunk not found for this user. Ensure trunk was created with passthrough_mode: true.');
    error.status = 404;
    throw error;
  }

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

// Upstream paginates with `page` (1-based) and sorts with sort_by/sort_order. An earlier
// build forwarded `offset`, which upstream does not read — every page but the first silently
// returned page 1. `passthrough_only` stays true by default because this endpoint is the
// passthrough view; pass it explicitly as false to include AI calls in the same query.
const getCallRecords = async (data) => {
  const {
    user_id, to_number, call_status, start_date, end_date,
    limit, page, sort_by, sort_order, passthrough_only,
  } = data;

  const user = await getUserWithKey(user_id);

  const params = { passthrough_only: passthrough_only === undefined ? true : passthrough_only };
  if (to_number) params.to_number = to_number;
  if (call_status) params.call_status = call_status;
  if (start_date) params.start_date = start_date;
  if (end_date) params.end_date = end_date;
  if (limit) params.limit = limit;
  if (page) params.page = page;
  if (sort_by) params.sort_by = sort_by;
  if (sort_order) params.sort_order = sort_order;

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
