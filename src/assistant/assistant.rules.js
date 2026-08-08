/**
 * Pure assistant payload rules — no I/O. Shared by the service (create/update),
 * the resync job, and scripts/check-assistant-payload.js.
 */

const badRequest = (message) => {
  const error = new Error(message);
  error.status = 400;
  return error;
};

// --- Upstream allowlists -----------------------------------------------------------------
// Mirrors of the external API's validators. They exist so a bad model or provider fails here
// with a readable 400 listing the valid values, instead of reaching upstream as a 422 whose
// body the proxy would have to unwrap. When upstream adds a model, add it here too.

// Realtime model IDs — used by `pipeline` (text-only modality) and `realtime` + openai.
const OPENAI_REALTIME_MODELS = [
  'gpt-realtime',
  'gpt-realtime-1.5',
  'gpt-realtime-mini',
  'gpt-4o-realtime-preview',
  'gpt-4o-mini-realtime-preview',
];

// Plain chat models for the cascade LLM stage. Disjoint from the realtime set on purpose:
// sending `gpt-4.1` in pipeline mode, or `gpt-realtime-1.5` in cascade, is a mistake either way.
const OPENAI_CASCADE_MODELS = [
  'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano',
  'gpt-4o', 'gpt-4o-mini',
  'gpt-5', 'gpt-5-mini', 'gpt-5-nano',
  'gpt-5.1', 'gpt-5.1-chat-latest',
  'gpt-5.2', 'gpt-5.2-chat-latest',
  'gpt-5.3-chat-latest',
  'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano',
  'gpt-5.5',
  'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna',
  'chat-latest',
  'gpt-oss-120b',
];

// Gemini Live model IDs are deliberately NOT listed: Google ships new ones often and an
// allowlist would reject them the day they land. Upstream leaves them free-form too.

// STT providers per mode. `native` means "the realtime model transcribes itself", so it is
// pipeline-only. The four plugin providers are cascade-native but are *accepted* in pipeline:
// upstream stores the selection and degrades to native transcription for the call, so
// switching the assistant to cascade later needs no second edit.
const CASCADE_STT_MODELS = ['sarvam', 'cartesia', 'deepgram', 'elevenlabs', 'openai'];
const PIPELINE_STT_MODELS = [...CASCADE_STT_MODELS, 'native'];

const quotedList = (values) => values.map((v) => `'${v}'`).join(', ');

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

// STT selection rules. Realtime ignores STT entirely (the model transcribes itself), so any
// value is accepted and stored there for the day the assistant switches modes.
//
// Pipeline accepts every provider, including the cascade-native ones: upstream degrades them to
// native transcription for the call rather than erroring, and keeps the stored selection.
// Cascade rejects only `native` — there is no realtime model there to transcribe itself.
const assertSttModelAllowedInMode = (mode, sttModel) => {
  if (sttModel === undefined || sttModel === null || sttModel === '') return;

  const model = String(sttModel).toLowerCase();

  if (mode === 'cascade') {
    if (!CASCADE_STT_MODELS.includes(model)) {
      throw badRequest(
        `assistant_stt_model must be one of ${quotedList(CASCADE_STT_MODELS)} in cascade mode` +
        (model === 'native' ? " — 'native' needs a realtime model to transcribe itself" : '')
      );
    }
    return;
  }

  if (mode === 'pipeline' && !PIPELINE_STT_MODELS.includes(model)) {
    throw badRequest(`assistant_stt_model must be one of ${quotedList(PIPELINE_STT_MODELS)}`);
  }
};

// LLM model IDs are validated against a different list per mode, because each mode talks to a
// different upstream API. Only OpenAI is checked — Gemini Live IDs stay free-form.
// An unset model is always fine: upstream fills in its own per-mode default.
const assertLlmModelAllowedInMode = (mode, provider, model) => {
  if (model === undefined || model === null || model === '') return;
  if (String(provider).toLowerCase() !== 'openai') return;

  const allowed = mode === 'cascade' ? OPENAI_CASCADE_MODELS : OPENAI_REALTIME_MODELS;
  if (allowed.includes(String(model))) return;

  const hint = mode === 'cascade'
    ? 'realtime model IDs belong to pipeline/realtime mode'
    : 'plain chat model IDs belong to cascade mode';
  throw badRequest(
    `assistant_llm_config.model '${model}' is not valid in ${mode} mode (${hint}). ` +
    `Expected one of: ${quotedList(allowed)}`
  );
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
  OPENAI_REALTIME_MODELS,
  OPENAI_CASCADE_MODELS,
  CASCADE_STT_MODELS,
  PIPELINE_STT_MODELS,
  assertLlmModelAllowedInMode,
  rejectRetiredModeAlias,
  requestedModeFrom,
  pickAssistantFields,
  normalizeMode,
  sanitizeInteractionConfigForMode,
  assertSttModelAllowedInMode,
  inferTargetModeForUpdate,
  resolvePairForUpdate,
};
