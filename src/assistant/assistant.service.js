/**
 * Assistant orchestration: create, list, details, delete — plus the public surface
 * for the update flow (assistant.update.js), call logs and billable minutes
 * (assistant.billing.js) and key-rotation re-sync (assistant.resync.js).
 * Payload rules live in assistant.rules.js, config construction in assistant.builder.js.
 */
const Assistant = require('../core/db/schemas/assistant.model');
const { callExternal } = require('../services/livekit/livekitService');
const getUserWithKey = require('../auth/userAccess');
const {
  rejectRetiredModeAlias,
  normalizeMode,
  sanitizeInteractionConfigForMode,
  assertSttModelAllowedInMode,
  assertLlmModelAllowedInMode,
} = require('./assistant.rules');
const {
  buildPipelineTtsConfig,
  buildPipelineSttConfig,
  resolveProvider,
  buildLlmConfig,
} = require('./assistant.builder');
const { resyncAssistantsForIntegration } = require('./assistant.resync');
const { updateAssistant } = require('./assistant.update');
const {
  getCallLogs,
  getTotalBillableDuration,
  getPlatformWiseBillableMinutes,
} = require('./assistant.billing');

// --- 1. Create Assistant ---
const createAssistant = async (data) => {
  const {
    user_id,
    assistant_name,
    assistant_description,
    assistant_prompt,
    assistant_mode,
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
  rejectRetiredModeAlias(data);
  const user = await getUserWithKey(user_id);

  const mode = normalizeMode(assistant_mode, 'pipeline');
  const provider = resolveProvider({
    llmConfig: assistant_llm_config,
    existing: null,
    mode,
    modeExplicit: true
  });
  assertLlmModelAllowedInMode(mode, provider, assistant_llm_config?.model);
  const interactionConfig = sanitizeInteractionConfigForMode(assistant_interaction_config, mode);

  // 3. Construct External Payload
  // Include only defined/provided fields so external API can use its defaults
  const externalPayload = {
    assistant_name,
    assistant_description,
    assistant_prompt,
    assistant_mode: mode
  };

  if (mode !== 'realtime') {
    assertSttModelAllowedInMode(mode, assistant_stt_model);

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
  // API key is optional in all modes; when missing, upstream may use its own system key.
  externalPayload.assistant_llm_config = await buildLlmConfig({
    userId: user._id,
    llmConfig: assistant_llm_config,
    provider,
    keyRequired: false
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

// --- 4. Delete Assistant (Existing) ---
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
};
