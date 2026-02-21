const axios = require('axios');
const https = require('https');
const SipTrunk = require('./sip.model');
const User = require('../auth/user.model'); 

const createOutboundTrunk = async (data) => {
  const { user_id, trunk_name, trunk_type, trunk_config } = data;

  // 1. Validate User & API Key
  const user = await User.findById(user_id);
  if (!user) throw new Error('User not found');
  if (!user.api_key) throw new Error('User does not have an API Key. Please generate one first.');

  // 2. Validate Trunk Type
  if (!['twilio', 'exotel'].includes(trunk_type.toLowerCase())) {
    throw new Error("Invalid trunk_type. Must be either 'twilio' or 'exotel'.");
  }

  const externalPayload = {
    trunk_name,
    trunk_type: trunk_type.toLowerCase(),
    trunk_config
  };

  let externalResponseData = null;

  // 3. Call External API
  try {
    const agent = new https.Agent({ rejectUnauthorized: false });
    const response = await axios.post(
      'https://api-livekit-vyom.indusnettechnologies.com/sip/create-outbound-trunk',
      externalPayload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.api_key}`
        },
        httpsAgent: agent
      }
    );

    externalResponseData = response.data;
  } catch (error) {
    if (error.response) throw new Error(error.response.data.message || 'External API Error');
    throw new Error('Failed to contact external SIP service');
  }

  // 4. Save to Local DB
  const newSipTrunk = new SipTrunk({
    user_id: user._id,
    external_trunk_id: externalResponseData.data.trunk_id, // Store the ID returned from the API
    trunk_name,
    trunk_type,
    trunk_config
  });

  return await newSipTrunk.save();
};

const listSipTrunks = async (userId) => {
  // 1. Validate User & API Key
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');
  if (!user.api_key) throw new Error('User does not have an API Key. Please generate one first.');

  // 2. Call External API
  try {
    const agent = new https.Agent({ rejectUnauthorized: false });
    const response = await axios.get(
      'https://api-livekit-vyom.indusnettechnologies.com/sip/list',
      {
        headers: { 'Authorization': `Bearer ${user.api_key}` },
        httpsAgent: agent
      }
    );
    
    // Return the successful response from the external API
    return response.data; 
  } catch (error) {
    if (error.response) throw new Error(error.response.data.message || 'Failed to fetch SIP trunks from external service');
    throw new Error('Failed to contact external SIP service');
  }
};

module.exports = {
  createOutboundTrunk,
  listSipTrunks // Don't forget to export the new function
};