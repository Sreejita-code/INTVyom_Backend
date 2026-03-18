const axios = require('axios');
const https = require('https');
const User = require('../auth/user.model');
const Assistant = require('../assistant/assistant.model');

const generateWebCallToken = async (data) => {
  const { user_id, assistant_id, metadata } = data;

  // 1. Validate User & API Key
  const user = await User.findById(user_id);
  if (!user) throw new Error('User not found');
  if (!user.api_key) throw new Error('User does not have an API Key. Please generate one first.');

  // 2. Resolve Assistant ID (Supports MongoDB _id or external_assistant_id)
  const assistant = await Assistant.findOne({
    $or: [
      { _id: assistant_id.match(/^[0-9a-fA-F]{24}$/) ? assistant_id : null },
      { external_assistant_id: assistant_id }
    ],
    user_id: user._id
  });

  if (!assistant) {
    throw new Error('Assistant not found for this user');
  }

  // 3. Construct External Payload
  const externalPayload = {
    assistant_id: assistant.external_assistant_id,
    metadata: metadata || {}
  };

  // 4. Hit the External API
  try {
    const agent = new https.Agent({ rejectUnauthorized: false });
    const response = await axios.post(
      'https://api-livekit-vyom.indusnettechnologies.com/web_call/get_token',
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
      throw new Error(error.response.data.message || 'External API Error while generating token');
    }
    throw new Error('Failed to contact external web call service');
  }
};

module.exports = {
  generateWebCallToken
};