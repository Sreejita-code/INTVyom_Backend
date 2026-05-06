const axios = require('axios');
const https = require('https');
const User = require('../auth/user.model');
const SipTrunk = require('../sip/sip.model');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const EXTERNAL_BASE = 'https://api-livekit-vyom.indusnettechnologies.com';

const makePassthroughOutboundCall = async (data) => {
  const { user_id, trunk_id, to_number, metadata } = data;

  const user = await User.findById(user_id);
  if (!user) throw new Error('User not found');
  if (!user.api_key) throw new Error('User does not have an API Key. Please generate one first.');

  const trunk = await SipTrunk.findOne({
    $or: [
      { _id: trunk_id.match(/^[0-9a-fA-F]{24}$/) ? trunk_id : null },
      { external_trunk_id: trunk_id }
    ],
    user_id: user._id,
    passthrough_mode: true
  });

  if (!trunk) throw new Error('Passthrough trunk not found for this user. Ensure trunk was created with passthrough_mode: true.');

  const externalPayload = {
    trunk_id: trunk.external_trunk_id,
    to_number,
    ...(metadata && { metadata })
  };

  try {
    const response = await axios.post(
      `${EXTERNAL_BASE}/call/outbound_passthrough`,
      externalPayload,
      {
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.api_key}` },
        httpsAgent
      }
    );
    return response.data;
  } catch (error) {
    if (error.response) throw new Error(error.response.data.message || 'External API Error while triggering call');
    throw new Error('Failed to contact external call service');
  }
};

const getCallRecords = async (data) => {
  const { user_id, to_number, call_status, start_date, end_date, limit, offset } = data;

  const user = await User.findById(user_id);
  if (!user) throw new Error('User not found');
  if (!user.api_key) throw new Error('User does not have an API Key. Please generate one first.');

  const params = { passthrough_only: true };
  if (to_number) params.to_number = to_number;
  if (call_status) params.call_status = call_status;
  if (start_date) params.start_date = start_date;
  if (end_date) params.end_date = end_date;
  if (limit) params.limit = limit;
  if (offset) params.offset = offset;

  try {
    const response = await axios.get(
      `${EXTERNAL_BASE}/call/records`,
      {
        params,
        headers: { 'Authorization': `Bearer ${user.api_key}` },
        httpsAgent
      }
    );
    return response.data;
  } catch (error) {
    if (error.response) throw new Error(error.response.data.message || 'External API Error while fetching records');
    throw new Error('Failed to contact external call service');
  }
};

module.exports = {
  makePassthroughOutboundCall,
  getCallRecords
};
