const axios = require('axios');
const https = require('https');
const Assistant = require('./assistant.model');
const User = require('../auth/user.model'); 
const Integration = require('../integration/integration.model'); // <-- Added Integration Model

// --- 1. Create Assistant ---
const createAssistant = async (data) => {
  const { 
    user_id, 
    assistant_name, 
    assistant_description, 
    assistant_prompt, 
    assistant_tts_model, 
    assistant_tts_config,
    assistant_start_instruction,
    assistant_end_call_url 
  } = data;

  // 1. Validate User
  const user = await User.findById(user_id);
  if (!user) throw new Error('User not found');
  if (!user.api_key) throw new Error('User does not have an API Key. Please generate one first.');

  // 2. Fetch Third-Party Integration API Key (Sarvam / Cartesia)
  let final_tts_config = { ...assistant_tts_config }; // Clone to avoid modifying the original request

  if (['sarvam', 'cartesia'].includes(assistant_tts_model?.toLowerCase())) {
    const integration = await Integration.findOne({
      user_id: user._id,
      service_name: assistant_tts_model.toLowerCase()
    });

    if (!integration || !integration.api_key) {
      throw new Error(`Integration required: Please integrate your ${assistant_tts_model} API key in the Integrations module first.`);
    }

    // Inject the API key directly into the configuration block for the external API
    final_tts_config.api_key = integration.api_key;
  }

  // 3. Construct External Payload
  const externalPayload = {
    assistant_name,
    assistant_description,
    assistant_prompt,
    assistant_tts_model,
    assistant_tts_config: final_tts_config, // Use the config WITH the injected API key
    assistant_start_instruction
  };

  if (assistant_end_call_url) {
    externalPayload.assistant_end_call_url = assistant_end_call_url;
  }

  let externalResponseData = null;

  try {
    const agent = new https.Agent({ rejectUnauthorized: false });
    const response = await axios.post(
      'https://api-livekit-vyom.indusnettechnologies.com/assistant/create',
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
    throw new Error('Failed to contact external assistant service');
  }

  // 4. Save to Local DB (Saving the original config WITHOUT the plain text API key for security)
  const newAssistant = new Assistant({
    user_id: user._id,
    external_assistant_id: externalResponseData.data.assistant_id,
    name: assistant_name,
    description: assistant_description,
    model: assistant_tts_model,
    config: assistant_tts_config, // Original config without API key
    prompt: assistant_prompt,
    start_instruction: assistant_start_instruction, 
    end_call_url: assistant_end_call_url || null
  });

  return await newAssistant.save();
};

// --- 2. List Assistants (Existing) ---
const listAssistants = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');
  if (!user.api_key) throw new Error('User does not have an API Key. Please generate one first.');

  try {
    const agent = new https.Agent({ rejectUnauthorized: false });
    const response = await axios.get(
      'https://api-livekit-vyom.indusnettechnologies.com/assistant/list',
      {
        headers: { 'Authorization': `Bearer ${user.api_key}` },
        httpsAgent: agent
      }
    );
    return response.data;
  } catch (error) {
    if (error.response) throw new Error(error.response.data.message || 'Failed to fetch assistants');
    throw new Error('Failed to contact external service');
  }
};

// --- 3. Get Assistant Details (Existing) ---
const getAssistantDetails = async (userId, assistantId) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');
  if (!user.api_key) throw new Error('User does not have an API Key. Please generate one first.');

  try {
    const agent = new https.Agent({ rejectUnauthorized: false });
    const response = await axios.get(
      `https://api-livekit-vyom.indusnettechnologies.com/assistant/details/${assistantId}`,
      {
        headers: { 'Authorization': `Bearer ${user.api_key}` },
        httpsAgent: agent
      }
    );
    return response.data;
  } catch (error) {
    if (error.response) {
      if (error.response.status === 404) throw new Error('Assistant not found in external system');
      throw new Error(error.response.data.message || 'Failed to fetch assistant details');
    }
    throw new Error('Failed to contact external service');
  }
};

// --- 4. Update Assistant ---
const updateAssistant = async (userId, assistantId, updateData) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');
  if (!user.api_key) throw new Error('User does not have an API Key. Please generate one first.');

  // Clone update data to safely mutate the payload going to the external API
  const externalUpdatePayload = { ...updateData };

  // 1. Check if TTS config or model is being updated, requiring an API key injection
  if (externalUpdatePayload.assistant_tts_model || externalUpdatePayload.assistant_tts_config) {
    
    // Determine the active model (either passed in the request, or fetched from DB)
    let modelToCheck = externalUpdatePayload.assistant_tts_model;
    if (!modelToCheck) {
      const existingAssistant = await Assistant.findOne({ external_assistant_id: assistantId });
      if (existingAssistant) modelToCheck = existingAssistant.model;
    }

    if (['sarvam', 'cartesia'].includes(modelToCheck?.toLowerCase())) {
      const integration = await Integration.findOne({ 
        user_id: user._id, 
        service_name: modelToCheck.toLowerCase() 
      });

      if (!integration || !integration.api_key) {
        throw new Error(`Integration required: Please integrate your ${modelToCheck} API key in the Integrations module first.`);
      }

      // Ensure config exists and inject the key
      if (!externalUpdatePayload.assistant_tts_config) {
        externalUpdatePayload.assistant_tts_config = {};
      }
      externalUpdatePayload.assistant_tts_config.api_key = integration.api_key;
    }
  }

  // 2. Call External API with the injected payload
  try {
    const agent = new https.Agent({ rejectUnauthorized: false });
    await axios.patch(
      `https://api-livekit-vyom.indusnettechnologies.com/assistant/update/${assistantId}`,
      externalUpdatePayload, // Sending the payload with the injected api_key
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.api_key}`
        },
        httpsAgent: agent
      }
    );
  } catch (error) {
    if (error.response) throw new Error(error.response.data.message || 'Failed to update assistant externally');
    throw new Error('Failed to contact external service');
  }

  // 3. Update Local DB (Storing original input without plain-text API keys)
  const localUpdateFields = {};
  if (updateData.assistant_name) localUpdateFields.name = updateData.assistant_name;
  if (updateData.assistant_description) localUpdateFields.description = updateData.assistant_description;
  if (updateData.assistant_prompt) localUpdateFields.prompt = updateData.assistant_prompt;
  if (updateData.assistant_tts_model) localUpdateFields.model = updateData.assistant_tts_model;
  if (updateData.assistant_tts_config) localUpdateFields.config = updateData.assistant_tts_config;
  if (updateData.assistant_start_instruction) localUpdateFields.start_instruction = updateData.assistant_start_instruction;
  if (updateData.assistant_end_call_url) localUpdateFields.end_call_url = updateData.assistant_end_call_url;

  const updatedAssistant = await Assistant.findOneAndUpdate(
    { external_assistant_id: assistantId }, 
    { $set: localUpdateFields },
    { new: true } 
  );

  return {
    success: true,
    message: "Assistant updated successfully",
    data: { assistant_id: assistantId },
    local_data: updatedAssistant 
  };
};

// --- 5. Delete Assistant (Existing) ---
const deleteAssistant = async (userId, assistantId) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');
  if (!user.api_key) throw new Error('User does not have an API Key. Please generate one first.');

  try {
    const agent = new https.Agent({ rejectUnauthorized: false });

    await axios.delete(
      `https://api-livekit-vyom.indusnettechnologies.com/assistant/delete/${assistantId}`,
      {
        headers: {
          'Authorization': `Bearer ${user.api_key}`
        },
        httpsAgent: agent
      }
    );

  } catch (error) {
    if (error.response) {
      throw new Error(error.response.data.message || 'Failed to delete assistant externally');
    }
    throw new Error('Failed to contact external service');
  }

  const deletedAssistant = await Assistant.findOneAndDelete({ external_assistant_id: assistantId });

  return {
    success: true,
    message: "Assistant deleted successfully",
    data: { assistant_id: assistantId },
    local_data_removed: !!deletedAssistant
  };
};

module.exports = {
  createAssistant,
  listAssistants,
  getAssistantDetails,
  updateAssistant,
  deleteAssistant 
};