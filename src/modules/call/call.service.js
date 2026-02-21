const axios = require('axios');
const https = require('https');
const User = require('../auth/user.model');
const SipTrunk = require('../sip/sip.model'); 
const Assistant = require('../assistant/assistant.model');

const makeOutboundCall = async (data) => {
  const { user_id, assistant_id, trunk_id, to_number } = data;

  // 1. Validate User & API Key
  const user = await User.findById(user_id);
  if (!user) throw new Error('User not found');
  if (!user.api_key) throw new Error('User does not have an API Key. Please generate one first.');

  // 2. Fetch the SIP Trunk to determine call_service (twilio or exotel)
  // This supports passing either the local MongoDB _id or the external_trunk_id
  const trunk = await SipTrunk.findOne({
    $or: [
      { _id: trunk_id.match(/^[0-9a-fA-F]{24}$/) ? trunk_id : null }, 
      { external_trunk_id: trunk_id }
    ],
    user_id: user._id
  });

  if (!trunk) {
    throw new Error('SIP Trunk not found for this user. Please provide a valid trunk ID.');
  }

  // 3. Fetch the Assistant to get the correct external_assistant_id
  const assistant = await Assistant.findOne({
    $or: [
      { _id: assistant_id.match(/^[0-9a-fA-F]{24}$/) ? assistant_id : null },
      { external_assistant_id: assistant_id }
    ],
    user_id: user._id
  });

  if (!assistant) {
    throw new Error('Assistant not found for this user. Please provide a valid assistant ID.');
  }

  // 4. Construct payload for the external API
  const externalPayload = {
    assistant_id: assistant.external_assistant_id,
    trunk_id: trunk.external_trunk_id,
    to_number: to_number,
    call_service: trunk.trunk_type // This automatically resolves to 'twilio' or 'exotel'
  };

  // 5. Call External API
  try {
    const agent = new https.Agent({ rejectUnauthorized: false });
    const response = await axios.post(
      'https://api-livekit-vyom.indusnettechnologies.com/call/outbound',
      externalPayload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.api_key}`
        },
        httpsAgent: agent
      }
    );

    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(error.response.data.message || 'Failed to trigger outbound call externally');
    }
    throw new Error('Failed to contact external call service');
  }
};

module.exports = {
  makeOutboundCall
};