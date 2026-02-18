const axios = require('axios');
const https = require('https');
const Assistant = require('./assistant.model');
const User = require('../auth/user.model'); 

// --- 1. Create Assistant (Existing) ---
const createAssistant = async (data) => {
  const { 
    user_id, 
    assistant_name, 
    assistant_description, 
    assistant_prompt, 
    assistant_tts_model, 
    assistant_tts_config,
    assistant_start_instruction,
    assistant_end_call_url // Optional field
  } = data;

  // Fetch the User to get their API Key
  const user = await User.findById(user_id);
  if (!user) {
    throw new Error('User not found');
  }
  if (!user.api_key) {
    throw new Error('User does not have an API Key. Please generate one first.');
  }

  // Prepare the External API Request Payload
  const externalPayload = {
    assistant_name,
    assistant_description,
    assistant_prompt,
    assistant_tts_model,
    assistant_tts_config,
    assistant_start_instruction
  };

  // Only add this field if it was provided in the request
  if (assistant_end_call_url) {
    externalPayload.assistant_end_call_url = assistant_end_call_url;
  }

  let externalResponseData = null;

  try {
    // Agent to ignore SSL errors
    const agent = new https.Agent({ rejectUnauthorized: false });

    console.log('Sending request to External Assistant API:', externalPayload);

    const response = await axios.post(
      'https://api-livekit-vyom.indusnettechnologies.com/assistant/create',
      externalPayload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.api_key}` // Use the user's stored key
        },
        httpsAgent: agent
      }
    );

    // Capture the external response data
    externalResponseData = response.data;

  } catch (error) {
    console.error('External Assistant API Failed:', error.message);
    if (error.response) {
      console.error('Server Response:', JSON.stringify(error.response.data, null, 2));
      throw new Error(error.response.data.message || 'External API Error');
    }
    throw new Error('Failed to contact external assistant service');
  }

  // Save the result to our Local DB
  const newAssistant = new Assistant({
    user_id: user._id,
    external_assistant_id: externalResponseData.data.assistant_id,
    name: assistant_name,
    description: assistant_description,
    model: assistant_tts_model,
    config: assistant_tts_config,
    prompt: assistant_prompt,
    start_instruction: assistant_start_instruction, 
    end_call_url: assistant_end_call_url || null
  });

  return await newAssistant.save();
};

// --- 2. List Assistants (New) ---
const listAssistants = async (userId) => {
  // Fetch the User to get their API Key
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }
  if (!user.api_key) {
    throw new Error('User does not have an API Key. Please generate one first.');
  }

  try {
    // Agent to ignore SSL errors
    const agent = new https.Agent({ rejectUnauthorized: false });

    // Call External API
    const response = await axios.get(
      'https://api-livekit-vyom.indusnettechnologies.com/assistant/list',
      {
        headers: {
          'Authorization': `Bearer ${user.api_key}` // Inject the stored key
        },
        httpsAgent: agent
      }
    );

    // Return the external data directly
    return response.data;

  } catch (error) {
    console.error('External List API Failed:', error.message);
    if (error.response) {
      // Pass the specific error message from the external API
      throw new Error(error.response.data.message || 'Failed to fetch assistants from external service');
    }
    throw new Error('Failed to contact external service');
  }
};

module.exports = {
  createAssistant,
  listAssistants
};