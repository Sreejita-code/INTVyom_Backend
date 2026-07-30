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
} = require('../src/modules/assistant/assistant.service');

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
  inferTargetModeForUpdate({ assistant_llm_mode: 'realtime' }, 'pipeline'),
  { targetMode: 'realtime', modeDerivedFromPayload: true }
);
// TTS/STT presence still implies pipeline.
assert.deepStrictEqual(
  inferTargetModeForUpdate({ assistant_tts_config: { speaker: 'anushka' } }, 'realtime'),
  { targetMode: 'pipeline', modeDerivedFromPayload: true }
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
assert.throws(() => inferTargetModeForUpdate({ assistant_llm_mode: 'hybrid' }, 'pipeline'), /pipeline.*realtime/);

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

console.log('assistant payload ok');
