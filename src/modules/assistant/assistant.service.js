const axios = require('axios');
const https = require('https');
const Assistant = require('./assistant.model');
const User = require('../auth/user.model'); 
const Integration = require('../integration/integration.model');

const TTS_INTEGRATION_MODELS = ['sarvam', 'cartesia', 'elevenlabs', 'mistral'];

const normalizeMode = (mode, defaultMode = 'pipeline') => {
  if (mode === undefined || mode === null || mode === '') return defaultMode;
  const normalized = String(mode).toLowerCase();
  if (normalized !== 'pipeline' && normalized !== 'realtime') {
    throw new Error("assistant_llm_mode must be either 'pipeline' or 'realtime'");
  }
  return normalized;
};

const sanitizeInteractionConfigForMode = (interactionConfig, mode) => {
  if (!interactionConfig || typeof interactionConfig !== 'object') return interactionConfig;
  const sanitized = { ...interactionConfig };
  if (mode === 'realtime') {
    sanitized.filler_words = false;
  }
  return sanitized;
};

const buildPipelineTtsConfig = async ({ userId, ttsModel, ttsConfig }) => {
  const finalTtsConfig = ttsConfig ? { ...ttsConfig } : undefined;

  if (TTS_INTEGRATION_MODELS.includes(ttsModel?.toLowerCase())) {
    const integration = await Integration.findOne({
      user_id: userId,
      service_name: ttsModel.toLowerCase()
    });

    if (!integration || !integration.api_key) {
      throw new Error(`Integration required: Please integrate your ${ttsModel} API key in the Integrations module first.`);
    }

    if (!finalTtsConfig) {
      return { api_key: integration.api_key };
    }

    finalTtsConfig.api_key = integration.api_key;
  }

  return finalTtsConfig;
};

const buildRealtimeLlmConfig = async ({ userId, llmConfig }) => {
  if (!llmConfig || typeof llmConfig !== 'object') {
    throw new Error('assistant_llm_config is required for realtime mode');
  }

  const finalLlmConfig = { ...llmConfig };
  if (!finalLlmConfig.provider) {
    finalLlmConfig.provider = 'gemini';
  }
  const provider = String(finalLlmConfig.provider).toLowerCase();

  if (provider === 'gemini') {
    const hasPerAssistantKey = typeof finalLlmConfig.api_key === 'string' && finalLlmConfig.api_key.trim() !== '';

    if (!hasPerAssistantKey) {
      const integration = await Integration.findOne({
        user_id: userId,
        service_name: 'gemini'
      });

      if (!integration || !integration.api_key) {
        throw new Error('Integration required: Please integrate your gemini API key in the Integrations module first.');
      }

      finalLlmConfig.api_key = integration.api_key;
    }
  }

  return finalLlmConfig;
};

const inferTargetModeForUpdate = (updateData, existingMode) => {
  if (updateData.assistant_llm_mode !== undefined) {
    return {
      targetMode: normalizeMode(updateData.assistant_llm_mode),
      modeDerivedFromPayload: true
    };
  }

  if (updateData.assistant_llm_config !== undefined) {
    return {
      targetMode: 'realtime',
      modeDerivedFromPayload: true
    };
  }

  if (updateData.assistant_tts_model !== undefined || updateData.assistant_tts_config !== undefined) {
    return {
      targetMode: 'pipeline',
      modeDerivedFromPayload: true
    };
  }

  return {
    targetMode: normalizeMode(existingMode, 'pipeline'),
    modeDerivedFromPayload: false
  };
};

// --- 1. Create Assistant ---
const createAssistant = async (data) => {
  const { 
    user_id, 
    assistant_name, 
    assistant_description, 
    assistant_prompt, 
    assistant_llm_mode,
    assistant_llm_config,
    assistant_tts_model, 
    assistant_tts_config,
    assistant_start_instruction,
    assistant_interaction_config,          // NEW: Interaction config object
    assistant_end_call_enabled,            // NEW: Boolean to enable end call tool
    assistant_end_call_trigger_phrase,     // NEW: Trigger phrase string
    assistant_end_call_agent_message,      // NEW: Agent message before ending call
    assistant_end_call_url 
  } = data;

  // 1. Validate User
  const user = await User.findById(user_id);
  if (!user) throw new Error('User not found');
  if (!user.api_key) throw new Error('User does not have an API Key. Please generate one first.');

  const mode = normalizeMode(assistant_llm_mode, 'pipeline');
  const interactionConfig = sanitizeInteractionConfigForMode(assistant_interaction_config, mode);

  // 3. Construct External Payload
  // Include only defined/provided fields so external API can use its defaults
  const externalPayload = {
    assistant_name,
    assistant_description,
    assistant_prompt,
    assistant_llm_mode: mode
  };

  if (mode === 'pipeline') {
    const finalTtsConfig = await buildPipelineTtsConfig({
      userId: user._id,
      ttsModel: assistant_tts_model,
      ttsConfig: assistant_tts_config
    });

    if (assistant_tts_model !== undefined) externalPayload.assistant_tts_model = assistant_tts_model;
    if (finalTtsConfig !== undefined) externalPayload.assistant_tts_config = finalTtsConfig;
  } else {
    const finalLlmConfig = await buildRealtimeLlmConfig({
      userId: user._id,
      llmConfig: assistant_llm_config
    });
    externalPayload.assistant_llm_config = finalLlmConfig;
  }

  if (assistant_start_instruction) externalPayload.assistant_start_instruction = assistant_start_instruction;
  if (interactionConfig) externalPayload.assistant_interaction_config = interactionConfig;
  if (typeof assistant_end_call_enabled === 'boolean') externalPayload.assistant_end_call_enabled = assistant_end_call_enabled;
  if (assistant_end_call_trigger_phrase) externalPayload.assistant_end_call_trigger_phrase = assistant_end_call_trigger_phrase;
  if (assistant_end_call_agent_message) externalPayload.assistant_end_call_agent_message = assistant_end_call_agent_message;
  if (assistant_end_call_url) externalPayload.assistant_end_call_url = assistant_end_call_url;

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

  // 4. Save to Local DB
  const newAssistant = new Assistant({
    user_id: user._id,
    external_assistant_id: externalResponseData.data.assistant_id,
    name: assistant_name,
    description: assistant_description,
    llm_mode: mode,
    llm_config: assistant_llm_config,
    model: assistant_tts_model,
    config: assistant_tts_config, // Keep original config locally, without the fetched secret key
    prompt: assistant_prompt,
    start_instruction: assistant_start_instruction, 
    interaction_config: interactionConfig,
    end_call_enabled: assistant_end_call_enabled,
    end_call_trigger_phrase: assistant_end_call_trigger_phrase,
    end_call_agent_message: assistant_end_call_agent_message,
    end_call_url: assistant_end_call_url
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

  const existingAssistant = await Assistant.findOne({ external_assistant_id: assistantId });

  const { targetMode, modeDerivedFromPayload } = inferTargetModeForUpdate(
    updateData,
    existingAssistant?.llm_mode
  );
  const shouldIncludeModeInExternal = updateData.assistant_llm_mode !== undefined || modeDerivedFromPayload;

  const externalUpdatePayload = { ...updateData };

  if (updateData.assistant_interaction_config !== undefined) {
    externalUpdatePayload.assistant_interaction_config = sanitizeInteractionConfigForMode(
      updateData.assistant_interaction_config,
      targetMode
    );
  }

  if (targetMode === 'realtime') {
    if (shouldIncludeModeInExternal) {
      externalUpdatePayload.assistant_llm_mode = 'realtime';
    } else {
      delete externalUpdatePayload.assistant_llm_mode;
    }
    delete externalUpdatePayload.assistant_tts_model;
    delete externalUpdatePayload.assistant_tts_config;

    if (updateData.assistant_llm_config !== undefined || modeDerivedFromPayload) {
      const llmConfigToUse = updateData.assistant_llm_config !== undefined
        ? updateData.assistant_llm_config
        : existingAssistant?.llm_config;

      externalUpdatePayload.assistant_llm_config = await buildRealtimeLlmConfig({
        userId: user._id,
        llmConfig: llmConfigToUse
      });
    }
  } else {
    if (shouldIncludeModeInExternal) {
      externalUpdatePayload.assistant_llm_mode = 'pipeline';
    } else {
      delete externalUpdatePayload.assistant_llm_mode;
    }
    delete externalUpdatePayload.assistant_llm_config;

    if (
      updateData.assistant_tts_model !== undefined ||
      updateData.assistant_tts_config !== undefined ||
      modeDerivedFromPayload
    ) {
      const modelToUse = updateData.assistant_tts_model !== undefined
        ? updateData.assistant_tts_model
        : existingAssistant?.model;

      const configToUse = updateData.assistant_tts_config !== undefined
        ? updateData.assistant_tts_config
        : undefined;

      const finalTtsConfig = await buildPipelineTtsConfig({
        userId: user._id,
        ttsModel: modelToUse,
        ttsConfig: configToUse
      });

      if (finalTtsConfig !== undefined) {
        externalUpdatePayload.assistant_tts_config = finalTtsConfig;
      }
    }
  }

  try {
    const agent = new https.Agent({ rejectUnauthorized: false });
    await axios.patch(
      `https://api-livekit-vyom.indusnettechnologies.com/assistant/update/${assistantId}`,
      externalUpdatePayload, 
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

  // Use explicit undefined checks so boolean false isn't ignored
  const localUpdateFields = {};
  if (updateData.assistant_name !== undefined) localUpdateFields.name = updateData.assistant_name;
  if (updateData.assistant_description !== undefined) localUpdateFields.description = updateData.assistant_description;
  if (updateData.assistant_prompt !== undefined) localUpdateFields.prompt = updateData.assistant_prompt;
  if (updateData.assistant_llm_config !== undefined) localUpdateFields.llm_config = updateData.assistant_llm_config;
  if (updateData.assistant_tts_model !== undefined) localUpdateFields.model = updateData.assistant_tts_model;
  if (updateData.assistant_tts_config !== undefined) localUpdateFields.config = updateData.assistant_tts_config;
  if (updateData.assistant_start_instruction !== undefined) localUpdateFields.start_instruction = updateData.assistant_start_instruction;
  if (updateData.assistant_interaction_config !== undefined) {
    localUpdateFields.interaction_config = sanitizeInteractionConfigForMode(
      updateData.assistant_interaction_config,
      targetMode
    );
  }
  if (updateData.assistant_llm_mode !== undefined || modeDerivedFromPayload) {
    localUpdateFields.llm_mode = targetMode;
  }
  if (updateData.assistant_end_call_enabled !== undefined) localUpdateFields.end_call_enabled = updateData.assistant_end_call_enabled;
  if (updateData.assistant_end_call_trigger_phrase !== undefined) localUpdateFields.end_call_trigger_phrase = updateData.assistant_end_call_trigger_phrase;
  if (updateData.assistant_end_call_agent_message !== undefined) localUpdateFields.end_call_agent_message = updateData.assistant_end_call_agent_message;
  if (updateData.assistant_end_call_url !== undefined) localUpdateFields.end_call_url = updateData.assistant_end_call_url;

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

// --- 6. Get Call Logs ---
const getCallLogs = async (userId, assistantId, queryParams) => {
  const user = await User.findById(userId);
  if (!user || !user.api_key) throw new Error('Valid User with API key required');

  const assistant = await Assistant.findOne({
    $or: [
      { _id: assistantId.match(/^[0-9a-fA-F]{24}$/) ? assistantId : null },
      { external_assistant_id: assistantId }
    ],
    user_id: userId
  });

  if (!assistant) throw new Error('Assistant not found');

  try {
    const agent = new https.Agent({ rejectUnauthorized: false }); 
    const response = await axios.get(
      `https://api-livekit-vyom.indusnettechnologies.com/assistant/call-logs/${assistant.external_assistant_id}`,
      {
        headers: { 'Authorization': `Bearer ${user.api_key}` },
        params: queryParams, 
        httpsAgent: agent 
      }
    );
    return response.data;
  } catch (error) {
    console.error("🚨 CALL LOGS ERROR:", error.response?.data || error.message || error); 
    if (error.response) {
      throw new Error(error.response.data.message || 'Failed to fetch call logs');
    }
    throw new Error('Failed to contact external service');
  }
};

module.exports = {
  createAssistant,
  listAssistants,
  getAssistantDetails,
  updateAssistant,
  deleteAssistant,
  getCallLogs 
};
