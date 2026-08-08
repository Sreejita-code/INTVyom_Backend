const SipTrunk = require('../core/db/schemas/sip.model');
const User = require('../core/db/schemas/user.model');
const { callExternal } = require('../services/livekit/livekitService');
const getUserWithKey = require('../auth/userAccess');
const findByLocalOrExternalId = require('../core/db/functions/findByLocalOrExternalId');

const createOutboundTrunk = async (data) => {
  const { user_id, trunk_name, trunk_type, trunk_config, passthrough_mode, passthrough_webhook_url } = data;

  const user = await getUserWithKey(user_id);

  if (!['twilio', 'exotel'].includes(trunk_type.toLowerCase())) {
    throw new Error("Invalid trunk_type. Must be either 'twilio' or 'exotel'.");
  }

  const externalPayload = {
    trunk_name,
    trunk_type: trunk_type.toLowerCase(),
    trunk_config,
    ...(passthrough_mode && { passthrough_mode: true }),
    ...(passthrough_webhook_url && { passthrough_webhook_url })
  };

  const externalResponseData = await callExternal(user.api_key, {
    method: 'post',
    path: '/sip/create-outbound-trunk',
    data: externalPayload,
    networkFallback: 'Failed to contact external SIP service',
  });

  const newSipTrunk = new SipTrunk({
    user_id: user._id,
    external_trunk_id: externalResponseData.data.trunk_id,
    trunk_name,
    // Lowercased to match the schema enum. Storing the caller's casing ("Twilio") threw a
    // validation error AFTER the upstream trunk had already been created, orphaning it.
    trunk_type: trunk_type.toLowerCase(),
    trunk_config,
    ...(passthrough_mode && { passthrough_mode: true }),
    ...(passthrough_webhook_url && { passthrough_webhook_url })
  });

  return await newSipTrunk.save();
};

const listSipTrunks = async (userId) => {
  // 1. Validate User
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  try {
    // 2. Fetch SIP trunks directly from your local MongoDB
    // Using .sort({ createdAt: -1 }) to return the newest ones first
    const trunks = await SipTrunk.find({ user_id: user._id }).sort({ createdAt: -1 });

    // 3. Return the data in a format similar to the old wrapper response
    return {
      success: true,
      message: "SIP trunks retrieved successfully from local database",
      data: trunks
    };
  } catch (error) {
    throw new Error('Failed to fetch SIP trunks from local database: ' + error.message);
  }
};

const getSipTrunkDetails = async (userId, trunkId) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const trunk = await findByLocalOrExternalId(SipTrunk, trunkId, user._id, 'external_trunk_id');
  if (!trunk) throw new Error('SIP Trunk not found');

  return {
    success: true,
    data: trunk
  };
};

const deleteSipTrunk = async (userId, trunkId) => {
  // getUserWithKey, not User.findById: the upstream deactivate call needs the API key.
  const user = await getUserWithKey(userId);

  const trunk = await findByLocalOrExternalId(SipTrunk, trunkId, user._id, 'external_trunk_id');
  if (!trunk) {
    const error = new Error('SIP Trunk not found for this user in the local database.');
    error.status = 404;
    throw error;
  }

  // Deactivate upstream FIRST. Dropping only the local row used to leave the trunk live and
  // billable on the external side with no local record left to find it by.
  //
  // 404 (already gone) and 400 (already deactivated) are both "upstream is in the state we
  // want", so the local row is still removed — otherwise a half-finished delete would strand
  // it forever. Any other failure aborts before the local delete, keeping the two in step.
  let externalDeactivated = true;
  try {
    await callExternal(user.api_key, {
      method: 'delete',
      path: `/sip/deactivate/${trunk.external_trunk_id}`,
      fallback: 'Failed to deactivate SIP trunk externally',
      networkFallback: 'Failed to contact external SIP service',
    });
  } catch (error) {
    if (error.status !== 404 && error.status !== 400) throw error;
    externalDeactivated = false;
  }

  const deletedTrunk = await SipTrunk.findByIdAndDelete(trunk._id);

  return {
    success: true,
    message: externalDeactivated
      ? 'SIP trunk deactivated externally and removed locally'
      : 'SIP trunk was already inactive externally; removed locally',
    data: {
      local_id: deletedTrunk._id,
      trunk_id: trunk.external_trunk_id
    },
    external_deactivated: externalDeactivated,
    local_data_removed: !!deletedTrunk
  };
};

module.exports = {
  createOutboundTrunk,
  listSipTrunks,
  getSipTrunkDetails,
  deleteSipTrunk
};
