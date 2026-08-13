// ponytail: assert-based self-check for the assistant payload rules, no framework, no DB,
// no network — it only exercises the pure helpers. Run:
//   node scripts/check-assistant-payload.js
//
// These are the rules the external API enforces and we used to get wrong:
//   - TTS goes out as a model+config pair, or not at all
//   - a config the caller didn't send is seeded from the stored assistant, not dropped
//   - assistant_llm_config alone does NOT mean "switch to realtime"
//   - unknown/retired keys never reach the external API
const assert = require('assert');
const {
  ASSISTANT_FIELDS,
  pickAssistantFields,
  inferTargetModeForUpdate,
  resolvePairForUpdate,
  rejectRetiredModeAlias,
  assertLlmModelAllowedInMode,
  assertLlmVoiceAllowedForProvider,
  assertSttModelIdAllowed,
  assertTtsModelIdAllowed,
  assertSarvamSpeakerAllowed,
  assertTtsPairProvidedForMode,
  assertTtsPairForModeUpdate,
  SERVICE_TIERS,
  TOOL_CHOICES,
} = require('../src/assistant/assistant.rules');

// --- whitelist ---------------------------------------------------------------
assert.deepStrictEqual(
  pickAssistantFields({ assistant_name: 'Bot', user_id: 'u1', assistnat_prompt: 'typo' }),
  { assistant_name: 'Bot' },
  'only known assistant_* fields survive'
);
// A retired key the external API answers with 422 must not be forwarded.
assert.deepStrictEqual(pickAssistantFields({ user_stt_provider: 'sarvam' }), {});
// false and null are real values; only undefined is treated as "not sent".
assert.deepStrictEqual(
  pickAssistantFields({ assistant_end_call_enabled: false, assistant_end_call_url: null, assistant_prompt: undefined }),
  { assistant_end_call_enabled: false, assistant_end_call_url: null }
);
assert.ok(ASSISTANT_FIELDS.includes('assistant_interaction_config'));

// --- mode inference ----------------------------------------------------------
// The bug this replaces: llm_config alone flipped a pipeline assistant to realtime and
// wiped its TTS/STT config.
assert.deepStrictEqual(
  inferTargetModeForUpdate({ assistant_llm_config: { api_key: 'sk-new' } }, 'pipeline'),
  { targetMode: 'pipeline', modeDerivedFromPayload: false }
);
// ...and it must not invent a mode for a realtime assistant either.
assert.deepStrictEqual(
  inferTargetModeForUpdate({ assistant_llm_config: {} }, 'realtime'),
  { targetMode: 'realtime', modeDerivedFromPayload: false }
);
// An explicit mode always wins.
assert.deepStrictEqual(
  inferTargetModeForUpdate({ assistant_mode: 'realtime' }, 'pipeline'),
  { targetMode: 'realtime', modeDerivedFromPayload: true }
);
// The retired assistant_llm_mode alias no longer drives mode inference.
assert.deepStrictEqual(
  inferTargetModeForUpdate({ assistant_llm_mode: 'cascade' }, 'pipeline'),
  { targetMode: 'pipeline', modeDerivedFromPayload: false }
);
// ...and is rejected outright at the create/update entry point.
assert.throws(() => rejectRetiredModeAlias({ assistant_llm_mode: 'realtime' }), /retired/);
assert.strictEqual(rejectRetiredModeAlias({ assistant_mode: 'cascade' }), undefined);
assert.strictEqual(rejectRetiredModeAlias({}), undefined);
// TTS/STT presence still implies pipeline.
assert.deepStrictEqual(
  inferTargetModeForUpdate({ assistant_tts_config: { speaker: 'anushka' } }, 'realtime'),
  { targetMode: 'pipeline', modeDerivedFromPayload: true }
);
// Existing cascade assistants stay in cascade when updating TTS/STT without an explicit mode.
assert.deepStrictEqual(
  inferTargetModeForUpdate({ assistant_stt_config: { language: 'hi-IN' } }, 'cascade'),
  { targetMode: 'cascade', modeDerivedFromPayload: true }
);
assert.deepStrictEqual(
  inferTargetModeForUpdate({ assistant_stt_model: 'native' }, 'realtime'),
  { targetMode: 'pipeline', modeDerivedFromPayload: true }
);
// Unrelated edit: fall back to the stored mode, and to pipeline when there is none.
assert.deepStrictEqual(
  inferTargetModeForUpdate({ assistant_name: 'Renamed' }, undefined),
  { targetMode: 'pipeline', modeDerivedFromPayload: false }
);
assert.throws(() => inferTargetModeForUpdate({ assistant_mode: 'hybrid' }, 'pipeline'), /pipeline.*realtime.*cascade/);

// --- pair resolution ---------------------------------------------------------
const stored = {
  tts_model: 'sarvam',
  tts_config: { speaker: 'anushka', target_language_code: 'hi-IN' },
  stt_model: 'sarvam',
  stt_config: { language: 'hi-IN' },
};

// Switching provider without a new config must NOT inherit the old provider's config —
// a Sarvam speaker/target_language_code means nothing to Cartesia.
assert.deepStrictEqual(
  resolvePairForUpdate({ assistant_tts_model: 'cartesia' }, stored, 'tts'),
  { model: 'cartesia', config: undefined }
);
// Re-sending the same provider must carry the stored config through — otherwise the speaker /
// voice_id / target_language_code silently reset to provider defaults.
assert.deepStrictEqual(
  resolvePairForUpdate({ assistant_tts_model: 'sarvam' }, stored, 'tts'),
  { model: 'sarvam', config: { speaker: 'anushka', target_language_code: 'hi-IN' } }
);
// Changing only the config must still produce a model, so the pair stays intact.
assert.deepStrictEqual(
  resolvePairForUpdate({ assistant_tts_config: { speaker: 'maitreyi' } }, stored, 'tts'),
  { model: 'sarvam', config: { speaker: 'maitreyi' } }
);
// Nothing sent, nothing stored: no model means send neither half.
assert.deepStrictEqual(resolvePairForUpdate({}, null, 'tts'), { model: undefined, config: undefined });
assert.deepStrictEqual(
  resolvePairForUpdate({}, { tts_model: undefined, tts_config: undefined }, 'tts'),
  { model: undefined, config: undefined }
);
// The caller can clear a config explicitly.
assert.deepStrictEqual(
  resolvePairForUpdate({ assistant_tts_config: {} }, stored, 'tts'),
  { model: 'sarvam', config: {} }
);
// Same helper drives STT: `native` takes no config fields, so the stored Sarvam
// `language` must be dropped rather than forwarded.
assert.deepStrictEqual(
  resolvePairForUpdate({ assistant_stt_model: 'native' }, stored, 'stt'),
  { model: 'native', config: undefined }
);
assert.deepStrictEqual(
  resolvePairForUpdate({}, stored, 'stt'),
  { model: 'sarvam', config: { language: 'hi-IN' } }
);

// --- model / voice / speaker allowlists -------------------------------------
// Realtime IDs: new ones in, the retired preview pair out (probed 2026-08-13).
for (const model of ['gpt-realtime', 'gpt-realtime-1.5', 'gpt-realtime-2', 'gpt-realtime-2025-08-28', 'gpt-realtime-mini']) {
  assert.doesNotThrow(() => assertLlmModelAllowedInMode('realtime', 'openai', model), `realtime accepts ${model}`);
}
assert.throws(() => assertLlmModelAllowedInMode('cascade', 'openai', 'gpt-realtime-1.5'), /not valid in cascade/);
assert.throws(() => assertLlmModelAllowedInMode('realtime', 'openai', 'gpt-4.1'), /not valid in realtime/);
// Gemini Live ids are validated, not free-form.
for (const model of ['gemini-2.5-flash-native-audio-preview-12-2025', 'gemini-live-2.5-flash-native-audio', 'gemini-3.1-flash-live-preview']) {
  assert.doesNotThrow(() => assertLlmModelAllowedInMode('realtime', 'gemini', model), `gemini accepts ${model}`);
}
assert.throws(() => assertLlmModelAllowedInMode('realtime', 'gemini', 'gemini-2.5-flash'), /not a Gemini Live model/);
// Voice roster: closed for gemini, open-but-gemini-excluded for openai.
assert.doesNotThrow(() => assertLlmVoiceAllowedForProvider('gemini', 'Puck'));
assert.throws(() => assertLlmVoiceAllowedForProvider('gemini', 'brand-new-voice'), /not a Gemini Live voice/);
assert.doesNotThrow(() => assertLlmVoiceAllowedForProvider('openai', 'marin'));
assert.throws(() => assertLlmVoiceAllowedForProvider('openai', 'Puck'), /Gemini Live voice/);
// STT / TTS model ids.
assert.doesNotThrow(() => assertSttModelIdAllowed('deepgram', 'nova-3'));
assert.throws(() => assertSttModelIdAllowed('deepgram', 'nova-9'), /does not have a STT model/);
assert.doesNotThrow(() => assertTtsModelIdAllowed('elevenlabs', 'eleven_v3'));
assert.throws(() => assertTtsModelIdAllowed('elevenlabs', 'eleven_v9'), /does not have a TTS model/);
// Sarvam speakers: v3 roster only.
assert.doesNotThrow(() => assertSarvamSpeakerAllowed('sarvam', 'shubh'));
assert.throws(() => assertSarvamSpeakerAllowed('sarvam', 'anushka'), /not available on bulbul:v3/);
// TTS pair rules.
assert.doesNotThrow(() => assertTtsPairProvidedForMode('pipeline', 'cartesia', { voice_id: 'v1' }));
assert.throws(() => assertTtsPairProvidedForMode('pipeline', 'cartesia', undefined), /assistant_tts_config is required/);
assert.throws(() => assertTtsPairForModeUpdate({ targetMode: 'pipeline' }), /no TTS configuration is stored/);
assert.doesNotThrow(() => assertTtsPairForModeUpdate({ targetMode: 'pipeline', storedTtsModel: 'sarvam' }));
assert.doesNotThrow(() => assertTtsPairForModeUpdate({ targetMode: 'realtime' }));
// Knob enums.
assert.deepStrictEqual(SERVICE_TIERS, ['auto', 'default', 'fast', 'priority', 'flex']);
assert.deepStrictEqual(TOOL_CHOICES, ['auto', 'required', 'none']);

console.log('assistant payload ok');
