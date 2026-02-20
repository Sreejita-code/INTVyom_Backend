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
    assistant_end_call_url 
  } = data;

  const user = await User.findById(user_id);
  if (!user) throw new Error('User not found');
  if (!user.api_key) throw new Error('User does not have an API Key. Please generate one first.');

  const externalPayload = {
    assistant_name,
    assistant_description,
    assistant_prompt,
    assistant_tts_model,
    assistant_tts_config,
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

// --- 4. Update Assistant (Existing) ---
const updateAssistant = async (userId, assistantId, updateData) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');
  if (!user.api_key) throw new Error('User does not have an API Key. Please generate one first.');

  try {
    const agent = new https.Agent({ rejectUnauthorized: false });
    await axios.patch(
      `https://api-livekit-vyom.indusnettechnologies.com/assistant/update/${assistantId}`,
      updateData,
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

// --- 5. Delete Assistant (New) ---
const deleteAssistant = async (userId, assistantId) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');
  if (!user.api_key) throw new Error('User does not have an API Key. Please generate one first.');

  try {
    const agent = new https.Agent({ rejectUnauthorized: false });

    console.log(`Deleting Assistant ${assistantId} externally`);

    // Call the external API to delete
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
    console.error('External Delete API Failed:', error.message);
    if (error.response) {
      console.error('Server Response:', JSON.stringify(error.response.data, null, 2));
      throw new Error(error.response.data.message || 'Failed to delete assistant externally');
    }
    throw new Error('Failed to contact external service');
  }

  // Delete the assistant from the Local Database
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
  deleteAssistant // Export the new function
};