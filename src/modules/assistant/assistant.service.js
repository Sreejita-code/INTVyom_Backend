const Assistant = require('./assistant.model');
const { callExternal, getUserWithKey, findByLocalOrExternalId } = require('../shared/remote');
const { keyNameFor, resolveApiKey, classify, modelsFor } = require('../integration/providers');

const badRequest = (message) => {
  const error = new Error(message);
  error.status = 400;
  return error;
};

// Every assistant_* field the external API accepts, in create-payload order. Drives both the
// create destructure and the update whitelist: forwarding an unknown or retired key (the removed
// assistant_interaction_config.user_stt_provider, a client typo) makes the external API answer 422.
const ASSISTANT_FIELDS = [
  'assistant_name',
  'assistant_description',
  'assistant_prompt',
  'assistant_llm_mode',
  'assistant_llm_config',
  'assistant_tts_model',
  'assistant_tts_config',
  'assistant_stt_model',
  'assistant_stt_config',
  'assistant_start_instruction',
  'assistant_interaction_config',
  'assistant_end_call_enabled',
  'assistant_end_call_trigger_phrase',
  'assistant_end_call_agent_message',
  'assistant_end_call_url',
  'assistant_greeting_audio',
];

const pickAssistantFields = (data) => {
  const picked = {};
  for (const field of ASSISTANT_FIELDS) {
    if (data[field] !== undefined) picked[field] = data[field];
  }
  return picked;
};

const normalizeMode = (mode, defaultMode = 'pipeline') => {
  if (mode === undefined || mode === null || mode === '') return defaultMode;
  const normalized = String(mode).toLowerCase();
  if (normalized !== 'pipeline' && normalized !== 'realtime') {
    throw badRequest("assistant_llm_mode must be either 'pipeline' or 'realtime'");
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

// TTS/STT keys always come from the Integrations module — any caller-supplied api_key
// is overwritten. Models with no entry in the provider map (e.g. stt `native`) need no
// key, so their config is forwarded verbatim.
const buildPipelineTtsConfig = async ({ userId, ttsModel, ttsConfig }) => {
  const finalTtsConfig = ttsConfig ? { ...ttsConfig } : undefined;

  if (keyNameFor('tts', ttsModel)) {
    const apiKey = await resolveApiKey({ userId, kind: 'tts', name: ttsModel, label: ttsModel });
    if (!finalTtsConfig) return { api_key: apiKey };
    finalTtsConfig.api_key = apiKey;
  }

  return finalTtsConfig;
};

const buildPipelineSttConfig = async ({ userId, sttModel, sttConfig }) => {
  const finalSttConfig = sttConfig ? { ...sttConfig } : undefined;

  if (keyNameFor('stt', sttModel)) {
    const apiKey = await resolveApiKey({ userId, kind: 'stt', name: sttModel, label: sttModel });
    if (!finalSttConfig) return { api_key: apiKey };
    finalSttConfig.api_key = apiKey;
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
  if (!keyNameFor('llm', provider)) {
    const allowed = modelsFor('llm').map((p) => `'${p}'`).join(' or ');
    throw badRequest(`assistant_llm_config.provider must be ${allowed}`);
  }
  return provider;
};

// Build the assistant_llm_config sent to the external API for either mode.
// Injects the resolved provider and resolves the api_key: caller-supplied key wins, otherwise
// pull the user's integrated key for that provider. In pipeline mode the key is optional — the
// external API falls back to its own system key — so a missing integration is not an error
// there; the field is simply omitted. Realtime requires a key.
const buildLlmConfig = async ({ userId, llmConfig, provider, keyRequired = true }) => {
  const finalLlmConfig = { ...(llmConfig || {}), provider };

  const hasPerAssistantKey = typeof finalLlmConfig.api_key === 'string' && finalLlmConfig.api_key.trim() !== '';
  if (!hasPerAssistantKey) {
    const apiKey = await resolveApiKey({ userId, kind: 'llm', name: provider, required: keyRequired });
    if (apiKey) finalLlmConfig.api_key = apiKey;
    else delete finalLlmConfig.api_key;
  }

  return finalLlmConfig;
};

// Which mode a PATCH targets. Only an explicit assistant_llm_mode or the presence of TTS/STT
// fields implies a mode — assistant_llm_config does NOT. Per the external API's update rules it
// is legal on its own in pipeline mode (to set api_key or pick gemini) and the stored TTS config
// is preserved, so inferring `realtime` from it would silently flip mode and wipe TTS/STT.
const inferTargetModeForUpdate = (updateData, existingMode) => {
  if (updateData.assistant_llm_mode !== undefined) {
    return {
      targetMode: normalizeMode(updateData.assistant_llm_mode),
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

// What model + config a provider slot ('tts' | 'stt') should be updated with: the caller's value
// wins, otherwise fall back to what is already stored on the assistant. Seeding the config from
// the DB matters — sending only assistant_tts_model would otherwise drop the stored speaker /
// voice_id / target_language_code. `model: undefined` means the slot was never configured and
// the caller sent nothing, so there is nothing to send.
const resolvePairForUpdate = (updateData, existing, kind) => {
  const storedModel = existing?.[`${kind}_model`] ?? undefined;

  const model = updateData[`assistant_${kind}_model`] !== undefined
    ? updateData[`assistant_${kind}_model`]
    : storedModel;

  let config = updateData[`assistant_${kind}_config`];
  if (config === undefined) {
    // The stored config belongs to the stored provider — carry it over only while the provider
    // is unchanged. Switching provider with no new config means "use the new one's defaults";
    // forwarding e.g. a Sarvam `language` to `native` would be rejected.
    config = model === storedModel ? existing?.[`${kind}_config`] : undefined;
  }

  return { model: model ?? undefined, config: config ?? undefined };
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

  // LLM vendor is forwarded in both modes (top-down provider setting). The key is only
  // mandatory in realtime — pipeline falls back to the external API's own system key.
  externalPayload.assistant_llm_config = await buildLlmConfig({
    userId: user._id,
    llmConfig: assistant_llm_config,
    provider,
    keyRequired: mode === 'realtime'
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
    tts_model: assistant_tts_model,
    tts_config: assistant_tts_config,
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

  // callExternal tags the thrown error with the upstream status, so a 404 here reaches
  // the client as a 404 without a message-string comparison.
  return callExternal(user.api_key, {
    path: `/assistant/details/${assistantId}`,
    fallback: 'Failed to fetch assistant details',
  });
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

  // Whitelist, not a spread: only fields the external API knows about go out.
  const externalUpdatePayload = pickAssistantFields(updateData);

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
      provider,
      keyRequired: targetMode === 'realtime'
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

    // TTS must go out as a pair — the external API rejects assistant_tts_config without
    // assistant_tts_model (there is no discriminator to validate the config against).
    if (
      updateData.assistant_tts_model !== undefined ||
      updateData.assistant_tts_config !== undefined ||
      modeDerivedFromPayload
    ) {
      const { model: ttsModel, config: ttsConfig } = resolvePairForUpdate(updateData, existingAssistant, 'tts');

      if (ttsModel === undefined) {
        // Never configured and the caller sent none: send neither half.
        delete externalUpdatePayload.assistant_tts_model;
        delete externalUpdatePayload.assistant_tts_config;
      } else {
        externalUpdatePayload.assistant_tts_model = ttsModel;
        // `?? {}` keeps the pair intact; every real TTS model resolves a key, so this only
        // fires for an unknown model, which the external API then rejects with its own message.
        externalUpdatePayload.assistant_tts_config = await buildPipelineTtsConfig({
          userId: user._id,
          ttsModel,
          ttsConfig
        }) ?? {};
      }
    }

    // STT is looser: the model alone is legal (it resets that provider's defaults), but a
    // lone config is rejected. `native` resolves no config, so it goes out as model-only.
    if (
      updateData.assistant_stt_model !== undefined ||
      updateData.assistant_stt_config !== undefined ||
      modeDerivedFromPayload
    ) {
      const { model: sttModel, config: sttConfig } = resolvePairForUpdate(updateData, existingAssistant, 'stt');

      if (sttModel === undefined) {
        delete externalUpdatePayload.assistant_stt_model;
        delete externalUpdatePayload.assistant_stt_config;
      } else {
        externalUpdatePayload.assistant_stt_model = sttModel;

        const finalSttConfig = await buildPipelineSttConfig({
          userId: user._id,
          sttModel,
          sttConfig
        });

        if (finalSttConfig !== undefined) externalUpdatePayload.assistant_stt_config = finalSttConfig;
        else delete externalUpdatePayload.assistant_stt_config;
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
  if (updateData.assistant_tts_model !== undefined) localUpdateFields.tts_model = updateData.assistant_tts_model;
  if (updateData.assistant_tts_config !== undefined) localUpdateFields.tts_config = updateData.assistant_tts_config;
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

// One external call-logs fetch. Shared by the raw log listing and both billable-minutes
// aggregators, which page through the same endpoint.
const fetchCallLogs = (apiKey, externalAssistantId, params) =>
  callExternal(apiKey, {
    path: `/assistant/call-logs/${externalAssistantId}`,
    params,
    fallback: 'Failed to fetch call logs',
  });

// --- 6. Get Call Logs ---
const getCallLogs = async (userId, assistantId, queryParams) => {
  const user = await getUserWithKey(userId);

  const assistant = await findByLocalOrExternalId(Assistant, assistantId, userId, 'external_assistant_id');
  if (!assistant) throw new Error('Assistant not found');

  return fetchCallLogs(user.api_key, assistant.external_assistant_id, queryParams);
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

  // Loop through all paginated results to ensure we sum up everything accurately
  do {
    // We only pass start_date, end_date to external API, along with page/limit
    const apiParams = {
      page: currentPage,
      limit: 100, // Fetch maximum per page to reduce the number of external API calls
    };

    if (queryParams.start_date) apiParams.start_date = queryParams.start_date;
    if (queryParams.end_date) apiParams.end_date = queryParams.end_date;

    const response = await fetchCallLogs(user.api_key, assistant.external_assistant_id, apiParams);

    const callLogsData = response?.data;

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
      // Same name as the platform-wise endpoint — one quantity, one key.
      total_billable_minutes: totalBillableMinutes,
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
        const response = await fetchCallLogs(user.api_key, assistant.external_assistant_id, apiParams);

        const callLogsData = response?.data;

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
        // callExternal already flattens the upstream message onto the Error.
        console.error(`Failed to fetch logs for assistant ${assistant.external_assistant_id}:`, error.message);
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
// (LLM matched by llm_provider, STT by stt_model, TTS by tts_model). Assistants that carry their own
// per-assistant api_key are left alone — an Integration key rotation is irrelevant to them.

const RESYNC_CONCURRENCY = 10; // ponytail: tune to LiveKit's rate limit

// Re-push one assistant's config with the freshly-stored key. `kinds` is the set of
// slots this rotation affects for this assistant — a shared vendor key (sarvam backs
// both TTS and STT) can touch more than one, and they go out in a single PATCH.
// Returns 'skipped' when every affected slot carries its own key, else 'synced'.
const resyncOne = async (user, a, kinds) => {
  const payload = {};

  for (const kind of kinds) {
    if (kind === 'llm') {
      if (a.llm_config?.api_key?.trim()) continue;
      payload.assistant_llm_config = await buildLlmConfig({
        userId: user._id,
        llmConfig: a.llm_config,
        provider: a.llm_provider
      });
    } else if (kind === 'stt') {
      if (a.stt_config?.api_key?.trim()) continue;
      payload.assistant_stt_model = a.stt_model;
      payload.assistant_stt_config = await buildPipelineSttConfig({
        userId: user._id,
        sttModel: a.stt_model,
        sttConfig: a.stt_config
      });
    } else {
      if (a.tts_config?.api_key?.trim()) continue;
      payload.assistant_tts_model = a.tts_model;
      payload.assistant_tts_config = await buildPipelineTtsConfig({
        userId: user._id,
        ttsModel: a.tts_model,
        ttsConfig: a.tts_config
      });
    }
  }

  if (Object.keys(payload).length === 0) return 'skipped';

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

  // What this row is good for comes from the provider map, so a shared key rotation
  // (e.g. `sarvam`) reaches both the TTS and the STT slot instead of only TTS.
  const targets = classify(serviceName);
  if (!targets) return { total: 0, succeeded: 0, failed: [] };

  const MATCH_FIELD = { llm: 'llm_provider', stt: 'stt_model', tts: 'tts_model' };
  const jobs = new Map(); // assistant id -> { assistant, kinds } so each gets one PATCH
  for (const { kind, model } of targets) {
    const matched = await Assistant.find({ user_id: user._id, [MATCH_FIELD[kind]]: model });
    for (const a of matched) {
      const id = String(a._id);
      if (!jobs.has(id)) jobs.set(id, { assistant: a, kinds: [] });
      jobs.get(id).kinds.push(kind);
    }
  }
  const assistants = [...jobs.values()];

  const total = assistants.length;
  let processed = 0;
  let succeeded = 0;
  const failed = [];
  if (onProgress) await onProgress({ total, processed, succeeded, failed });

  for (let i = 0; i < assistants.length; i += RESYNC_CONCURRENCY) {
    const batch = assistants.slice(i, i + RESYNC_CONCURRENCY);
    const results = await Promise.allSettled(batch.map(j => resyncOne(user, j.assistant, j.kinds)));
    results.forEach((r, k) => {
      processed++;
      if (r.status === 'fulfilled') {
        if (r.value === 'synced') succeeded++;
      } else {
        failed.push({ assistant_id: batch[k].assistant.external_assistant_id, error: r.reason.message });
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
  resyncAssistantsForIntegration,
  // Pure payload helpers — exported for scripts/check-assistant-payload.js.
  ASSISTANT_FIELDS,
  pickAssistantFields,
  inferTargetModeForUpdate,
  resolvePairForUpdate
};