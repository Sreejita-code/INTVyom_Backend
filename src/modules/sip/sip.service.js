const axios = require('axios');
const https = require('https');
const SipTrunk = require('./sip.model');
const User = require('../auth/user.model'); 

const createOutboundTrunk = async (data) => {
  const { user_id, trunk_name, trunk_type, trunk_config } = data;

  const user = await User.findById(user_id);
  if (!user) throw new Error('User not found');
  if (!user.api_key) throw new Error('User does not have an API Key. Please generate one first.');

  if (!['twilio', 'exotel'].includes(trunk_type.toLowerCase())) {
    throw new Error("Invalid trunk_type. Must be either 'twilio' or 'exotel'.");
  }

  const externalPayload = {
    trunk_name,
    trunk_type: trunk_type.toLowerCase(),
    trunk_config
  };

  let externalResponseData = null;

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

  const newSipTrunk = new SipTrunk({
    user_id: user._id,
    external_trunk_id: externalResponseData.data.trunk_id,
    trunk_name,
    trunk_type,
    trunk_config
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

const deleteSipTrunk = async (userId, trunkId) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const trunk = await SipTrunk.findOne({
    $or: [
      { _id: trunkId.match(/^[0-9a-fA-F]{24}$/) ? trunkId : null },
      { external_trunk_id: trunkId }
    ],
    user_id: user._id
  });

  if (!trunk) {
    throw new Error('SIP Trunk not found for this user in the local database.');
  }

  const deletedTrunk = await SipTrunk.findByIdAndDelete(trunk._id);

  return {
    success: true,
    message: "SIP trunk deleted successfully from local database",
    data: { 
      local_id: deletedTrunk._id,
      trunk_id: trunk.external_trunk_id 
    },
    local_data_removed: !!deletedTrunk
  };
};

module.exports = {
  createOutboundTrunk,
  listSipTrunks,
  deleteSipTrunk
};