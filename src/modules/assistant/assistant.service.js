const axios = require('axios');
const https = require('https');
const Assistant = require('./assistant.model');
const User = require('../auth/user.model');
const Integration = require('../integration/integration.model');
const { callExternal, getUserWithKey, findByLocalOrExternalId } = require('../shared/remote');

const TTS_INTEGRATION_MODELS = ['sarvam', 'cartesia', 'elevenlabs', 'mistral'];
const STT_INTEGRATION_MODELS = ['sarvam'];

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

const buildPipelineSttConfig = async ({ userId, sttModel, sttConfig }) => {
  const finalSttConfig = sttConfig ? { ...sttConfig } : undefined;

  if (STT_INTEGRATION_MODELS.includes(sttModel?.toLowerCase())) {
    const integration = await Integration.findOne({
      user_id: userId,
      service_name: `${sttModel.toLowerCase()}_stt`
    });

    if (!integration || !integration.api_key) {
      throw new Error(`Integration required: Please integrate your ${sttModel} STT API key in the Integrations module first.`);
    }

    if (!finalSttConfig) {
      return { api_key: integration.api_key };
    }

    finalSttConfig.api_key = integration.api_key;
  }

  return finalSttConfig;
};

// Top-down provider resolution: explicit request value wins, else the persisted
// per-assistant provider (dedicated field, then legacy nested value), else default openai.
// This is what keeps the vendor consistent across a pipeline<->realtime switch.
const resolveProvider = (llmConfig, existing) => {
  const raw = llmConfig?.provider
    ?? existing?.llm_provider
    ?? existing?.llm_config?.provider;
  const provider = raw ? String(raw).toLowerCase() : 'openai';
  if (provider !== 'openai' && provider !== 'gemini') {
    throw new Error("assistant_llm_config.provider must be 'openai' or 'gemini'");
  }
  return provider;
};

// Build the assistant_llm_config sent to the external API for either mode.
// Injects the resolved provider and resolves the api_key: caller-supplied key wins,
// otherwise pull the user's integrated key for that provider (required — throws if absent).
const buildLlmConfig = async ({ userId, llmConfig, provider }) => {
  const finalLlmConfig = { ...(llmConfig || {}), provider };

  const hasPerAssistantKey = typeof finalLlmConfig.api_key === 'string' && finalLlmConfig.api_key.trim() !== '';
  if (!hasPerAssistantKey) {
    const integration = await Integration.findOne({
      user_id: userId,
      service_name: provider // 'openai' or 'gemini'
    });

    if (!integration || !integration.api_key) {
      throw new Error(`Integration required: Please integrate your ${provider} API key in the Integrations module first.`);
    }

    finalLlmConfig.api_key = integration.api_key;
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

  if (updateData.assistant_tts_model !== undefined || updateData.assistant_tts_config !== undefined ||
      updateData.assistant_stt_model !== undefined || updateData.assistant_stt_config !== undefined) {
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
    assistant_stt_model,
    assistant_stt_config,
    assistant_start_instruction,
    assistant_interaction_config,          
    assistant_end_call_enabled,            
    assistant_end_call_trigger_phrase,     
    assistant_end_call_agent_message,      
    assistant_end_call_url,
    assistant_greeting_audio 
  } = data;

  // 1. Validate User
  const user = await getUserWithKey(user_id);

  const mode = normalizeMode(assistant_llm_mode, 'pipeline');
  const provider = resolveProvider(assistant_llm_config, null);
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

    const finalSttConfig = await buildPipelineSttConfig({
      userId: user._id,
      sttModel: assistant_stt_model,
      sttConfig: assistant_stt_config
    });

    if (assistant_stt_model !== undefined) externalPayload.assistant_stt_model = assistant_stt_model;
    if (finalSttConfig !== undefined) externalPayload.assistant_stt_config = finalSttConfig;
  }

  // LLM vendor is forwarded in both modes (top-down provider setting).
  externalPayload.assistant_llm_config = await buildLlmConfig({
    userId: user._id,
    llmConfig: assistant_llm_config,
    provider
  });

  if (assistant_start_instruction) externalPayload.assistant_start_instruction = assistant_start_instruction;
  if (interactionConfig) externalPayload.assistant_interaction_config = interactionConfig;
  if (typeof assistant_end_call_enabled === 'boolean') externalPayload.assistant_end_call_enabled = assistant_end_call_enabled;
  if (assistant_end_call_trigger_phrase) externalPayload.assistant_end_call_trigger_phrase = assistant_end_call_trigger_phrase;
  if (assistant_end_call_agent_message) externalPayload.assistant_end_call_agent_message = assistant_end_call_agent_message;
  if (assistant_end_call_url) externalPayload.assistant_end_call_url = assistant_end_call_url;
  if (assistant_greeting_audio) externalPayload.assistant_greeting_audio = assistant_greeting_audio;

  const externalResponseData = await callExternal(user.api_key, {
    method: 'post',
    path: '/assistant/create',
    data: externalPayload,
    networkFallback: 'Failed to contact external assistant service',
  });

  // 4. Save to Local DB
  const newAssistant = new Assistant({
    user_id: user._id,
    external_assistant_id: externalResponseData.data.assistant_id,
    name: assistant_name,
    description: assistant_description,
    llm_mode: mode,
    llm_provider: provider,
    llm_config: assistant_llm_config,
    model: assistant_tts_model,
    config: assistant_tts_config,
    stt_model: assistant_stt_model,
    stt_config: assistant_stt_config,
    prompt: assistant_prompt,
    start_instruction: assistant_start_instruction, 
    interaction_config: interactionConfig,
    end_call_enabled: assistant_end_call_enabled,
    end_call_trigger_phrase: assistant_end_call_trigger_phrase,
    end_call_agent_message: assistant_end_call_agent_message,
    end_call_url: assistant_end_call_url,
    greeting_audio: assistant_greeting_audio
  });

  return await newAssistant.save();
};

// --- 2. List Assistants (Existing) ---
const listAssistants = async (userId, queryParams = {}) => {
  const user = await getUserWithKey(userId);
  return callExternal(user.api_key, {
    path: '/assistant/list',
    params: queryParams,
    fallback: 'Failed to fetch assistants',
  });
};

// --- 3. Get Assistant Details (Existing) ---
const getAssistantDetails = async (userId, assistantId) => {
  const user = await getUserWithKey(userId);

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
  const user = await getUserWithKey(userId);

  const existingAssistant = await Assistant.findOne({ external_assistant_id: assistantId });

  const { targetMode, modeDerivedFromPayload } = inferTargetModeForUpdate(
    updateData,
    existingAssistant?.llm_mode
  );
  const shouldIncludeModeInExternal = updateData.assistant_llm_mode !== undefined || modeDerivedFromPayload;
  const provider = resolveProvider(updateData.assistant_llm_config, existingAssistant);
  // Re-send the LLM vendor only when the caller touches llm config or the mode
  // (every real mode switch sets the mode) — not on unrelated name/TTS edits.
  const touchesLlm = updateData.assistant_llm_config !== undefined || updateData.assistant_llm_mode !== undefined;

  const externalUpdatePayload = { ...updateData };

  if (updateData.assistant_interaction_config !== undefined) {
    externalUpdatePayload.assistant_interaction_config = sanitizeInteractionConfigForMode(
      updateData.assistant_interaction_config,
      targetMode
    );
  }

  // LLM vendor is forwarded in both modes (top-down provider setting), resolved above.
  if (touchesLlm) {
    const llmConfigToUse = updateData.assistant_llm_config !== undefined
      ? updateData.assistant_llm_config
      : existingAssistant?.llm_config;

    externalUpdatePayload.assistant_llm_config = await buildLlmConfig({
      userId: user._id,
      llmConfig: llmConfigToUse,
      provider
    });
  } else {
    delete externalUpdatePayload.assistant_llm_config;
  }

  if (targetMode === 'realtime') {
    if (shouldIncludeModeInExternal) {
      externalUpdatePayload.assistant_llm_mode = 'realtime';
    } else {
      delete externalUpdatePayload.assistant_llm_mode;
    }
    delete externalUpdatePayload.assistant_tts_model;
    delete externalUpdatePayload.assistant_tts_config;
    delete externalUpdatePayload.assistant_stt_model;
    delete externalUpdatePayload.assistant_stt_config;
  } else {
    if (shouldIncludeModeInExternal) {
      externalUpdatePayload.assistant_llm_mode = 'pipeline';
    } else {
      delete externalUpdatePayload.assistant_llm_mode;
    }

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

    if (
      updateData.assistant_stt_model !== undefined ||
      updateData.assistant_stt_config !== undefined ||
      modeDerivedFromPayload
    ) {
      const modelToUse = updateData.assistant_stt_model !== undefined
        ? updateData.assistant_stt_model
        : existingAssistant?.stt_model;

      const configToUse = updateData.assistant_stt_config !== undefined
        ? updateData.assistant_stt_config
        : undefined;

      const finalSttConfig = await buildPipelineSttConfig({
        userId: user._id,
        sttModel: modelToUse,
        sttConfig: configToUse
      });

      if (finalSttConfig !== undefined) {
        externalUpdatePayload.assistant_stt_config = finalSttConfig;
      }
    }
  }

  await callExternal(user.api_key, {
    method: 'patch',
    path: `/assistant/update/${assistantId}`,
    data: externalUpdatePayload,
    fallback: 'Failed to update assistant externally',
  });

  // Use explicit undefined checks so boolean false isn't ignored
  const localUpdateFields = {};
  if (updateData.assistant_name !== undefined) localUpdateFields.name = updateData.assistant_name;
  if (updateData.assistant_description !== undefined) localUpdateFields.description = updateData.assistant_description;
  if (updateData.assistant_prompt !== undefined) localUpdateFields.prompt = updateData.assistant_prompt;
  if (updateData.assistant_llm_config !== undefined) localUpdateFields.llm_config = updateData.assistant_llm_config;
  if (updateData.assistant_tts_model !== undefined) localUpdateFields.model = updateData.assistant_tts_model;
  if (updateData.assistant_tts_config !== undefined) localUpdateFields.config = updateData.assistant_tts_config;
  if (updateData.assistant_stt_model !== undefined) localUpdateFields.stt_model = updateData.assistant_stt_model;
  if (updateData.assistant_stt_config !== undefined) localUpdateFields.stt_config = updateData.assistant_stt_config;
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
  // Persist the resolved provider (top-down setting) on every update.
  localUpdateFields.llm_provider = provider;
  if (updateData.assistant_end_call_enabled !== undefined) localUpdateFields.end_call_enabled = updateData.assistant_end_call_enabled;
  if (updateData.assistant_end_call_trigger_phrase !== undefined) localUpdateFields.end_call_trigger_phrase = updateData.assistant_end_call_trigger_phrase;
  if (updateData.assistant_end_call_agent_message !== undefined) localUpdateFields.end_call_agent_message = updateData.assistant_end_call_agent_message;
  if (updateData.assistant_end_call_url !== undefined) localUpdateFields.end_call_url = updateData.assistant_end_call_url;
  if (updateData.assistant_greeting_audio !== undefined) localUpdateFields.greeting_audio = updateData.assistant_greeting_audio;

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
  const user = await getUserWithKey(userId);

  await callExternal(user.api_key, {
    method: 'delete',
    path: `/assistant/delete/${assistantId}`,
    fallback: 'Failed to delete assistant externally',
  });

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
  const user = await getUserWithKey(userId);

  const assistant = await findByLocalOrExternalId(Assistant, assistantId, userId, 'external_assistant_id');
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

// --- 7. Get Total Billable Minutes ---
const getTotalBillableDuration = async (userId, assistantId, queryParams) => {
  const user = await getUserWithKey(userId);

  // Find the assistant
  const assistant = await findByLocalOrExternalId(Assistant, assistantId, userId, 'external_assistant_id');
  if (!assistant) throw new Error('Assistant not found');

  const targetNumber = queryParams.to_number;
  if (!targetNumber) throw new Error('to_number is required to calculate billable minutes');

  let totalBillableMinutes = 0;
  let currentPage = 1;
  let totalPages = 1;

  const agent = new https.Agent({ rejectUnauthorized: false });

  // Loop through all paginated results to ensure we sum up everything accurately
  do {
    // We only pass start_date, end_date to external API, along with page/limit
    const apiParams = {
      page: currentPage,
      limit: 100, // Fetch maximum per page to reduce the number of external API calls
    };
    
    if (queryParams.start_date) apiParams.start_date = queryParams.start_date;
    if (queryParams.end_date) apiParams.end_date = queryParams.end_date;

    const response = await axios.get(
      `https://api-livekit-vyom.indusnettechnologies.com/assistant/call-logs/${assistant.external_assistant_id}`,
      {
        headers: { 'Authorization': `Bearer ${user.api_key}` },
        params: apiParams,
        httpsAgent: agent
      }
    );

    const callLogsData = response.data?.data;
    
    if (callLogsData && callLogsData.logs) {
      // Filter logs by the specific to_number and sum up billable_duration_minutes
      const filteredLogs = callLogsData.logs.filter(log => log.to_number === targetNumber);
      
      for (const log of filteredLogs) {
        totalBillableMinutes += (log.billable_duration_minutes || 0);
      }
      
      // Update totalPages based on external API pagination metadata
      totalPages = callLogsData.pagination?.total_pages || 1;
    } else {
      break; // Exit if no data is found
    }
    
    currentPage++;
  } while (currentPage <= totalPages);

  return {
    success: true,
    message: "Total billable minutes calculated successfully",
    data: {
      assistant_id: assistant.external_assistant_id,
      to_number: targetNumber,
      total_billable_duration_minutes: totalBillableMinutes,
      timespan_evaluated: {
        start_date: queryParams.start_date || 'lifetime',
        end_date: queryParams.end_date || 'lifetime'
      }
    }
  };
};

// --- 8. Get Platform-Wise Billable Minutes For All Assistants ---
const getPlatformWiseBillableMinutes = async (userId, queryParams) => {
  const user = await getUserWithKey(userId);

  // Find all assistants for this user from the local DB
  const assistants = await Assistant.find({ user_id: user._id });
  
  if (!assistants || assistants.length === 0) {
    return {
      success: true,
      message: "No assistants found for this user",
      data: { platform_wise_minutes: [] }
    };
  }

  const platformBillableMap = {};
  const agent = new https.Agent({ rejectUnauthorized: false });

  // Loop through all assistants
  for (const assistant of assistants) {
    let currentPage = 1;
    let totalPages = 1;

    // Loop through paginated call logs for the current assistant
    do {
      const apiParams = {
        page: currentPage,
        limit: 100 // Maximum limit to reduce API calls
      };
      
      if (queryParams.start_date) apiParams.start_date = queryParams.start_date;
      if (queryParams.end_date) apiParams.end_date = queryParams.end_date;

      try {
        const response = await axios.get(
          `https://api-livekit-vyom.indusnettechnologies.com/assistant/call-logs/${assistant.external_assistant_id}`,
          {
            headers: { 'Authorization': `Bearer ${user.api_key}` },
            params: apiParams,
            httpsAgent: agent
          }
        );

        const callLogsData = response.data?.data;
        
        if (callLogsData && callLogsData.logs) {
          // Aggregate by platform_number
          for (const log of callLogsData.logs) {
            const pNumber = log.platform_number || 'Unknown Platform';
            const mins = log.billable_duration_minutes || 0;
            
            if (!platformBillableMap[pNumber]) {
              platformBillableMap[pNumber] = 0;
            }
            platformBillableMap[pNumber] += mins;
          }
          
          totalPages = callLogsData.pagination?.total_pages || 1;
        } else {
          break; // Exit if no logs found
        }
      } catch (error) {
        console.error(`Failed to fetch logs for assistant ${assistant.external_assistant_id}:`, error.response?.data?.message || error.message);
        break; // Break the while loop to skip to the next assistant on error
      }
      
      currentPage++;
    } while (currentPage <= totalPages);
  }

  // Format the map into a clean array
  const aggregatedData = Object.keys(platformBillableMap).map(platform_number => ({
    platform_number,
    total_billable_minutes: platformBillableMap[platform_number]
  }));

  return {
    success: true,
    message: "Platform-wise billable minutes calculated successfully",
    data: {
      platform_wise_minutes: aggregatedData,
      timespan_evaluated: {
        start_date: queryParams.start_date || 'lifetime',
        end_date: queryParams.end_date || 'lifetime'
      }
    }
  };
};

// --- Re-sync assistants after an Integration key is rotated ---
// A provider key is snapshotted into each assistant on the external side at create/update time.
// When the user stores a new key, push it to every existing assistant that uses that provider
// (LLM matched by llm_provider, TTS matched by model). Assistants that carry their own
// per-assistant api_key are left alone — an Integration key rotation is irrelevant to them.

const RESYNC_CONCURRENCY = 10; // ponytail: tune to LiveKit's rate limit

// Re-push one assistant's config with the freshly-stored key. Returns 'skipped' when the
// assistant uses its own key (rotation irrelevant), else 'synced'. Throws on external failure.
const resyncOne = async (user, a, isLlm, serviceName) => {
  const isStt = !isLlm && serviceName.endsWith('_stt');
  const payload = {};
  if (isLlm) {
    if (a.llm_config?.api_key?.trim()) return 'skipped';
    payload.assistant_llm_config = await buildLlmConfig({
      userId: user._id,
      llmConfig: a.llm_config,
      provider: a.llm_provider || serviceName
    });
  } else if (isStt) {
    if (a.stt_config?.api_key?.trim()) return 'skipped';
    payload.assistant_stt_model = serviceName.replace('_stt', '');
    payload.assistant_stt_config = await buildPipelineSttConfig({
      userId: user._id,
      sttModel: payload.assistant_stt_model,
      sttConfig: a.stt_config
    });
  } else {
    if (a.config?.api_key?.trim()) return 'skipped';
    payload.assistant_tts_model = a.model;
    payload.assistant_tts_config = await buildPipelineTtsConfig({
      userId: user._id,
      ttsModel: a.model,
      ttsConfig: a.config
    });
  }

  await callExternal(user.api_key, {
    method: 'patch',
    path: `/assistant/update/${a.external_assistant_id}`,
    data: payload,
    fallback: 'Failed to re-sync assistant',
  });
  return 'synced';
};

// Batched, best-effort. Calls onProgress({total,processed,succeeded,failed}) once up front and
// after each batch so a background caller can persist progress. Returns the final summary.
const resyncAssistantsForIntegration = async ({ user, serviceName, onProgress }) => {
  if (!user?.api_key) return { total: 0, succeeded: 0, failed: [] }; // no external assistants possible

  const isStt = serviceName.endsWith('_stt');
  const isLlm = serviceName === 'openai' || serviceName === 'gemini';
  const isTts = TTS_INTEGRATION_MODELS.includes(serviceName);
  if (!isLlm && !isTts && !isStt) return { total: 0, succeeded: 0, failed: [] };

  const query = isLlm
    ? { user_id: user._id, llm_provider: serviceName }
    : isStt
      ? { user_id: user._id, stt_model: serviceName.replace('_stt', '') }
      : { user_id: user._id, model: serviceName };
  const assistants = await Assistant.find(query);

  const total = assistants.length;
  let processed = 0;
  let succeeded = 0;
  const failed = [];
  if (onProgress) await onProgress({ total, processed, succeeded, failed });

  for (let i = 0; i < assistants.length; i += RESYNC_CONCURRENCY) {
    const batch = assistants.slice(i, i + RESYNC_CONCURRENCY);
    const results = await Promise.allSettled(batch.map(a => resyncOne(user, a, isLlm, serviceName)));
    results.forEach((r, k) => {
      processed++;
      if (r.status === 'fulfilled') {
        if (r.value === 'synced') succeeded++;
      } else {
        failed.push({ assistant_id: batch[k].external_assistant_id, error: r.reason.message });
      }
    });
    if (onProgress) await onProgress({ total, processed, succeeded, failed });
  }

  return { total, succeeded, failed };
};

module.exports = {
  createAssistant,
  listAssistants,
  getAssistantDetails,
  updateAssistant,
  deleteAssistant,
  getCallLogs,
  getTotalBillableDuration,
  getPlatformWiseBillableMinutes,
  resyncAssistantsForIntegration
};