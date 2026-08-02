/**
 * Pure assistant payload rules — no I/O. Shared by the service (create/update),
 * the resync job, and scripts/check-assistant-payload.js.
 */

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
  'assistant_mode',
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

// The retired assistant_llm_mode alias is rejected with a clear 400 — silently mapping it
// would hide the rename from old clients and could create an assistant in the wrong mode.
const rejectRetiredModeAlias = (data = {}) => {
  if (data.assistant_llm_mode !== undefined) {
    throw badRequest(
      "assistant_llm_mode is retired — use assistant_mode ('pipeline', 'realtime', or 'cascade')"
    );
  }
};

const requestedModeFrom = (data = {}) => data.assistant_mode;

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
  if (normalized !== 'pipeline' && normalized !== 'realtime' && normalized !== 'cascade') {
    throw badRequest("assistant_mode must be one of 'pipeline', 'realtime', or 'cascade'");
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

const assertSttModelAllowedInMode = (mode, sttModel) => {
  if (sttModel === undefined || sttModel === null || sttModel === '') return;

  if (mode === 'cascade' && sttModel === 'native') {
    throw badRequest("assistant_stt_model must be 'sarvam' or 'cartesia' in cascade mode");
  }
  if (mode === 'pipeline' && sttModel === 'cartesia') {
    throw badRequest("assistant_stt_model 'cartesia' is only supported in cascade mode");
  }
};

// Which mode a PATCH targets. Only an explicit assistant_mode or the presence of TTS/STT
// fields implies a mode — assistant_llm_config does NOT. Per the external API's update rules it
// is legal on its own in pipeline mode (to set api_key or pick gemini) and the stored TTS config
// is preserved, so inferring `realtime` from it would silently flip mode and wipe TTS/STT.
const inferTargetModeForUpdate = (updateData, existingMode) => {
  const requestedMode = requestedModeFrom(updateData);
  if (requestedMode !== undefined) {
    return {
      targetMode: normalizeMode(requestedMode),
      modeDerivedFromPayload: true
    };
  }

  if (updateData.assistant_tts_model !== undefined || updateData.assistant_tts_config !== undefined ||
      updateData.assistant_stt_model !== undefined || updateData.assistant_stt_config !== undefined) {
    return {
      targetMode: normalizeMode(existingMode, 'pipeline') === 'cascade' ? 'cascade' : 'pipeline',
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

module.exports = {
  badRequest,
  ASSISTANT_FIELDS,
  rejectRetiredModeAlias,
  requestedModeFrom,
  pickAssistantFields,
  normalizeMode,
  sanitizeInteractionConfigForMode,
  assertSttModelAllowedInMode,
  inferTargetModeForUpdate,
  resolvePairForUpdate,
};
