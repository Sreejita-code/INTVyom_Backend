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
// The `gpt-4o-*-realtime-preview` pair is deliberately NOT here: probed on 2026-08-13 the
// account does not serve either, so storing one produced a session that could not connect.
const OPENAI_REALTIME_MODELS = [
  'gpt-realtime',
  'gpt-realtime-1.5',
  'gpt-realtime-2',
  'gpt-realtime-2025-08-28',
  'gpt-realtime-mini',
];

// Gemini Live model IDs ARE validated, against the installed plugin's own list. The Live API is
// a much smaller and slower-moving set than the Gemini chat models, and a chat id such as
// `gemini-2.5-flash` is not refused by the plugin — it opens a socket the API then closes.
const GEMINI_LIVE_MODELS = [
  'gemini-2.5-flash-native-audio-preview-12-2025',
  'gemini-live-2.5-flash-native-audio',
  'gemini-3.1-flash-live-preview',
];

// The 30 Gemini Live voices. Closed set in the installed plugin — a name outside it cannot work.
// Mirrors the plugin's roster; verify against the upstream capabilities.py when it changes.
const GEMINI_VOICES = [
  'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede',
  'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina',
  'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar', 'Alnilam', 'Schedar',
  'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi', 'Vindemiatrix', 'Sadachbia',
  'Sadaltager', 'Sulafat',
];

// Plain chat models for the cascade LLM stage. Disjoint from the realtime set on purpose:
// sending `gpt-4.1` in pipeline mode, or `gpt-realtime-1.5` in cascade, is a mistake either way.
//
// The `*-chat-latest` aliases were retired by OpenAI on 2026-06-19, and `chat-latest` (a LiveKit
// Inference gateway id needing Cloud credentials) and `gpt-oss-120b` (served by baseten and groq,
// not by `api.openai.com`) were never served by the API this stage talks to. All five are
// deliberately NOT here — an assistant still holding one answers calls with silence.
const OPENAI_CASCADE_MODELS = [
  'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano',
  'gpt-4o', 'gpt-4o-mini',
  'gpt-5', 'gpt-5-mini', 'gpt-5-nano',
  'gpt-5.1',
  'gpt-5.2',
  'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano',
  'gpt-5.5',
  'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna',
];

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
// different upstream API. OpenAI is checked against the realtime/cascade split; Gemini Live IDs
// are checked against the plugin's own Live list in `realtime` mode. An unset model is always
// fine: upstream fills in its own per-mode default.
const assertLlmModelAllowedInMode = (mode, provider, model) => {
  if (model === undefined || model === null || model === '') return;

  const providerLower = String(provider).toLowerCase();

  if (providerLower === 'gemini') {
    if (GEMINI_LIVE_MODELS.includes(String(model))) return;
    throw badRequest(
      `assistant_llm_config.model '${model}' is not a Gemini Live model — expected one of: ` +
      `${quotedList(GEMINI_LIVE_MODELS)}. A Gemini chat id such as 'gemini-2.5-flash' opens a ` +
      'socket the API then closes'
    );
  }

  if (providerLower !== 'openai') return;

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

// `assistant_llm_config.voice` is one field shared by two providers whose rosters have nothing in
// common — the mistake it catches is switching provider and leaving the voice behind. Gemini's
// roster is a closed set; OpenAI ships realtime voices without an SDK list, so any name that is
// NOT a Gemini voice is allowed through.
const assertLlmVoiceAllowedForProvider = (provider, voice) => {
  if (voice === undefined || voice === null || voice === '') return;

  const providerLower = String(provider || '').toLowerCase();
  const voiceValue = String(voice);

  if (providerLower === 'gemini' && !GEMINI_VOICES.includes(voiceValue)) {
    throw badRequest(
      `assistant_llm_config.voice '${voice}' is not a Gemini Live voice — the roster is a closed ` +
      `set: ${quotedList(GEMINI_VOICES)}`
    );
  }

  if (providerLower === 'openai' && GEMINI_VOICES.includes(voiceValue)) {
    throw badRequest(
      `assistant_llm_config.voice '${voice}' is a Gemini Live voice and is not accepted under ` +
      "provider 'openai' — OpenAI realtime voices are anything that is not a Gemini name " +
      "(e.g. 'marin', 'cedar', 'alloy')"
    );
  }
};

// Per-provider STT model ids. Mirrors the upstream speech model sets — a typo such as `nova-9`
// used to be stored happily and then end the job at call start. Providers whose model is pinned
// in the factory (none here) take no `model` field at all.
const STT_MODELS_BY_PROVIDER = {
  sarvam: ['saaras:v3', 'saaras:v2.5', 'saarika:v2.5'],
  cartesia: ['ink-whisper', 'ink-2'],
  deepgram: ['nova-3', 'nova-2', 'flux-general-en', 'flux-general-multi'],
  elevenlabs: ['scribe_v2_realtime', 'scribe_v2', 'scribe_v1'],
  openai: ['gpt-4o-mini-transcribe', 'gpt-4o-transcribe', 'whisper-1'],
};

const assertSttModelIdAllowed = (provider, model) => {
  if (model === undefined || model === null || model === '') return;

  const providerLower = String(provider || '').toLowerCase();
  const allowed = STT_MODELS_BY_PROVIDER[providerLower];
  if (!allowed) return; // `native` / unknown provider — no model field exists

  if (allowed.includes(String(model))) return;
  throw badRequest(
    `'${providerLower}' does not have a STT model called '${model}' — choose one of: ` +
    `${quotedList(allowed)}. See docs/reference/models.md.`
  );
};

// TTS model ids. Only ElevenLabs takes a `model` key; the other providers pin theirs in the
// factory (Cartesia `sonic-3`, Sarvam `bulbul:v3`, Mistral `voxtral-mini-tts-2603`).
const ELEVENLABS_TTS_MODELS = [
  'eleven_v3',
  'eleven_multilingual_v2',
  'eleven_turbo_v2_5',
  'eleven_flash_v2_5',
];

const assertTtsModelIdAllowed = (provider, model) => {
  if (model === undefined || model === null || model === '') return;
  if (String(provider || '').toLowerCase() !== 'elevenlabs') return;

  if (ELEVENLABS_TTS_MODELS.includes(String(model))) return;
  throw badRequest(
    `'elevenlabs' does not have a TTS model called '${model}' — choose one of: ` +
    `${quotedList(ELEVENLABS_TTS_MODELS)}`
  );
};

// Sarvam `speaker` must come from the bulbul:v3 roster. The two Bulbul generations share no
// speaker names, so every v2 name (`anushka`, `manisha`, `vidya`, `arya`, `abhilash`, `karun`,
// `hitesh`) is invalid on the v3 model this platform pins. Unlike a bad language code, a bad
// speaker is NOT substituted at call time — the call ends before it starts.
const SARVAM_SPEAKERS = [
  'aayan', 'aditya', 'advait', 'amelia', 'amit', 'ashutosh', 'dev', 'ishita', 'kabir',
  'kavitha', 'kavya', 'manan', 'neha', 'pooja', 'priya', 'rahul', 'ratan', 'ritu', 'rohan',
  'roopa', 'rupali', 'shreya', 'shruti', 'shubh', 'simran', 'sophia', 'suhani', 'sumit',
  'tanya', 'varun',
];

const assertSarvamSpeakerAllowed = (ttsModel, speaker) => {
  if (speaker === undefined || speaker === null || speaker === '') return;
  if (String(ttsModel || '').toLowerCase() !== 'sarvam') return;

  if (SARVAM_SPEAKERS.includes(String(speaker))) return;
  throw badRequest(
    `Sarvam speaker '${speaker}' is not available on bulbul:v3 — v2 and v3 share no speaker ` +
    `names; bulbul:v3 speakers are: ${quotedList(SARVAM_SPEAKERS)}. Update ` +
    'assistant_tts_config.speaker.'
  );
};

// `assistant_llm_config.service_tier`. `auto`/`default`/`fast`/`priority` work on every model;
// `flex` is gpt-5 generation only (rejected here against the family lists); `scale` is not an
// OpenAI tier at all — it was removed from the accepted values and can never have worked.
const SERVICE_TIERS = ['auto', 'default', 'fast', 'priority', 'flex'];
const TOOL_CHOICES = ['auto', 'required', 'none'];

// Create rule: pipeline and cascade have no realtime model to speak for them, so both halves of
// the TTS pair are required. Realtime ignores TTS entirely.
const assertTtsPairProvidedForMode = (mode, ttsModel, ttsConfig) => {
  if (mode === 'realtime') return;

  if (ttsModel === undefined || ttsModel === null || ttsModel === '') {
    throw badRequest(
      `assistant_tts_model is required in ${mode} mode — send it together with assistant_tts_config`
    );
  }
  if (ttsConfig === undefined || ttsConfig === null) {
    throw badRequest(
      `assistant_tts_config is required in ${mode} mode — send it together with assistant_tts_model`
    );
  }
};

// Update rule: switching into pipeline/cascade needs the TTS pair only when the assistant has no
// TTS config stored (a realtime-created assistant). Once stored, the config is preserved and
// reused. Changing provider without a config is also refused — the stored config belongs to the
// old provider and sending `{}` would fail upstream.
const assertTtsPairForModeUpdate = ({ targetMode, storedTtsModel, ttsModelSent, ttsConfigSent }) => {
  if (targetMode === 'realtime') return;

  const modelSent = ttsModelSent !== undefined && ttsModelSent !== null && ttsModelSent !== '';
  const configSent = ttsConfigSent !== undefined && ttsConfigSent !== null;
  const hasStoredTts = storedTtsModel !== undefined && storedTtsModel !== null && storedTtsModel !== '';

  if (!hasStoredTts && !modelSent) {
    throw badRequest(
      `assistant_tts_model and assistant_tts_config are required when moving to '${targetMode}' — ` +
      'no TTS configuration is stored on this assistant'
    );
  }
  if (modelSent && !configSent && storedTtsModel !== ttsModelSent) {
    throw badRequest(
      "assistant_tts_config must accompany assistant_tts_model when changing the TTS provider — " +
      `the stored config belongs to '${storedTtsModel ?? 'none'}', not '${ttsModelSent}'`
    );
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
  OPENAI_REALTIME_MODELS,
  OPENAI_CASCADE_MODELS,
  GEMINI_LIVE_MODELS,
  GEMINI_VOICES,
  SERVICE_TIERS,
  TOOL_CHOICES,
  STT_MODELS_BY_PROVIDER,
  ELEVENLABS_TTS_MODELS,
  SARVAM_SPEAKERS,
  CASCADE_STT_MODELS,
  PIPELINE_STT_MODELS,
  assertLlmModelAllowedInMode,
  assertLlmVoiceAllowedForProvider,
  assertSttModelIdAllowed,
  assertTtsModelIdAllowed,
  assertSarvamSpeakerAllowed,
  assertTtsPairProvidedForMode,
  assertTtsPairForModeUpdate,
  rejectRetiredModeAlias,
  requestedModeFrom,
  pickAssistantFields,
  normalizeMode,
  sanitizeInteractionConfigForMode,
  assertSttModelAllowedInMode,
  inferTargetModeForUpdate,
  resolvePairForUpdate,
};
