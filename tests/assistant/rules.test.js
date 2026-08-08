const test = require('node:test');
const assert = require('node:assert');
const {
  ASSISTANT_FIELDS,
  pickAssistantFields,
  rejectRetiredModeAlias,
  normalizeMode,
  sanitizeInteractionConfigForMode,
  assertSttModelAllowedInMode,
  assertLlmModelAllowedInMode,
  inferTargetModeForUpdate,
  resolvePairForUpdate,
} = require('../../src/assistant/assistant.rules');

test('pickAssistantFields only keeps known assistant_* fields', () => {
  assert.deepStrictEqual(
    pickAssistantFields({ assistant_name: 'Bot', user_id: 'u1', assistnat_prompt: 'typo' }),
    { assistant_name: 'Bot' }
  );
  // A retired key the external API answers with 422 must not be forwarded.
  assert.deepStrictEqual(pickAssistantFields({ user_stt_provider: 'sarvam' }), {});
  // false and null are real values; only undefined is treated as "not sent".
  assert.deepStrictEqual(
    pickAssistantFields({ assistant_end_call_enabled: false, assistant_end_call_url: null, assistant_prompt: undefined }),
    { assistant_end_call_enabled: false, assistant_end_call_url: null }
  );
  assert.ok(ASSISTANT_FIELDS.includes('assistant_interaction_config'));
});

test('rejectRetiredModeAlias throws on the retired assistant_llm_mode key', () => {
  assert.throws(() => rejectRetiredModeAlias({ assistant_llm_mode: 'realtime' }), /retired/);
  assert.strictEqual(rejectRetiredModeAlias({ assistant_mode: 'cascade' }), undefined);
  assert.strictEqual(rejectRetiredModeAlias({}), undefined);
});

test('normalizeMode accepts the three known modes and defaults', () => {
  assert.strictEqual(normalizeMode('Realtime'), 'realtime');
  assert.strictEqual(normalizeMode(undefined, 'pipeline'), 'pipeline');
  assert.strictEqual(normalizeMode('', 'cascade'), 'cascade');
  assert.throws(() => normalizeMode('hybrid'), /pipeline.*realtime.*cascade/);
});

test('sanitizeInteractionConfigForMode forces filler_words off in realtime', () => {
  assert.deepStrictEqual(
    sanitizeInteractionConfigForMode({ filler_words: true, speaks_first: true }, 'realtime'),
    { filler_words: false, speaks_first: true }
  );
  assert.deepStrictEqual(
    sanitizeInteractionConfigForMode({ filler_words: true }, 'pipeline'),
    { filler_words: true }
  );
  assert.strictEqual(sanitizeInteractionConfigForMode(undefined, 'realtime'), undefined);
});

test('assertSttModelAllowedInMode enforces per-mode STT rules', () => {
  assert.doesNotThrow(() => assertSttModelAllowedInMode('pipeline', 'sarvam'));
  assert.doesNotThrow(() => assertSttModelAllowedInMode('pipeline', 'native'));

  // Cascade takes all five plugin providers; only `native` is out, because there is no
  // realtime model there to transcribe itself.
  for (const model of ['sarvam', 'cartesia', 'deepgram', 'elevenlabs', 'openai']) {
    assert.doesNotThrow(() => assertSttModelAllowedInMode('cascade', model));
  }
  assert.throws(() => assertSttModelAllowedInMode('cascade', 'native'), /cascade mode/);

  // Cascade-native providers are ACCEPTED in pipeline: upstream stores the selection and
  // degrades transcription to native for the call, so switching to cascade later just works.
  for (const model of ['cartesia', 'deepgram', 'elevenlabs', 'openai']) {
    assert.doesNotThrow(() => assertSttModelAllowedInMode('pipeline', model));
  }

  // Unknown names still fail here rather than reaching upstream as a 422.
  assert.throws(() => assertSttModelAllowedInMode('pipeline', 'whisper'), /must be one of/);
  assert.throws(() => assertSttModelAllowedInMode('cascade', 'whisper'), /must be one of/);

  // Realtime ignores STT entirely — anything is stored for the day the mode changes.
  assert.doesNotThrow(() => assertSttModelAllowedInMode('realtime', 'native'));
  // An unset model is never an error; upstream fills in its own default.
  assert.doesNotThrow(() => assertSttModelAllowedInMode('cascade', undefined));
});

test('assertLlmModelAllowedInMode splits the realtime and cascade model families', () => {
  assert.doesNotThrow(() => assertLlmModelAllowedInMode('cascade', 'openai', 'gpt-4.1'));
  assert.doesNotThrow(() => assertLlmModelAllowedInMode('cascade', 'openai', 'gpt-5.6-luna'));
  assert.doesNotThrow(() => assertLlmModelAllowedInMode('pipeline', 'openai', 'gpt-realtime-1.5'));
  assert.doesNotThrow(() => assertLlmModelAllowedInMode('realtime', 'openai', 'gpt-realtime-mini'));

  // The two sets are disjoint: each family's IDs are an error in the other's mode.
  assert.throws(() => assertLlmModelAllowedInMode('cascade', 'openai', 'gpt-realtime-1.5'), /not valid in cascade/);
  assert.throws(() => assertLlmModelAllowedInMode('pipeline', 'openai', 'gpt-4.1'), /not valid in pipeline/);

  // Gemini Live IDs stay free-form — Google ships new ones faster than an allowlist can track.
  assert.doesNotThrow(() => assertLlmModelAllowedInMode('realtime', 'gemini', 'gemini-9-live-whatever'));
  // Unset model: upstream applies its own per-mode default.
  assert.doesNotThrow(() => assertLlmModelAllowedInMode('cascade', 'openai', undefined));
});

test('inferTargetModeForUpdate: llm_config alone never flips the mode', () => {
  assert.deepStrictEqual(
    inferTargetModeForUpdate({ assistant_llm_config: { api_key: 'sk-new' } }, 'pipeline'),
    { targetMode: 'pipeline', modeDerivedFromPayload: false }
  );
  assert.deepStrictEqual(
    inferTargetModeForUpdate({ assistant_llm_config: {} }, 'realtime'),
    { targetMode: 'realtime', modeDerivedFromPayload: false }
  );
});

test('inferTargetModeForUpdate: explicit mode wins, TTS/STT imply pipeline', () => {
  assert.deepStrictEqual(
    inferTargetModeForUpdate({ assistant_mode: 'realtime' }, 'pipeline'),
    { targetMode: 'realtime', modeDerivedFromPayload: true }
  );
  // The retired alias no longer drives mode inference.
  assert.deepStrictEqual(
    inferTargetModeForUpdate({ assistant_llm_mode: 'cascade' }, 'pipeline'),
    { targetMode: 'pipeline', modeDerivedFromPayload: false }
  );
  assert.deepStrictEqual(
    inferTargetModeForUpdate({ assistant_tts_config: { speaker: 'anushka' } }, 'realtime'),
    { targetMode: 'pipeline', modeDerivedFromPayload: true }
  );
  // Existing cascade assistants stay in cascade on TTS/STT-only updates.
  assert.deepStrictEqual(
    inferTargetModeForUpdate({ assistant_stt_config: { language: 'hi-IN' } }, 'cascade'),
    { targetMode: 'cascade', modeDerivedFromPayload: true }
  );
  // Unrelated edit falls back to the stored mode, pipeline when there is none.
  assert.deepStrictEqual(
    inferTargetModeForUpdate({ assistant_name: 'Renamed' }, undefined),
    { targetMode: 'pipeline', modeDerivedFromPayload: false }
  );
  assert.throws(() => inferTargetModeForUpdate({ assistant_mode: 'hybrid' }, 'pipeline'), /pipeline.*realtime.*cascade/);
});

test('resolvePairForUpdate seeds config from the stored assistant', () => {
  const stored = {
    tts_model: 'sarvam',
    tts_config: { speaker: 'anushka', target_language_code: 'hi-IN' },
    stt_model: 'sarvam',
    stt_config: { language: 'hi-IN' },
  };

  // Switching provider without a new config must NOT inherit the old provider's config.
  assert.deepStrictEqual(
    resolvePairForUpdate({ assistant_tts_model: 'cartesia' }, stored, 'tts'),
    { model: 'cartesia', config: undefined }
  );
  // Same provider keeps the stored config through.
  assert.deepStrictEqual(
    resolvePairForUpdate({ assistant_tts_model: 'sarvam' }, stored, 'tts'),
    { model: 'sarvam', config: { speaker: 'anushka', target_language_code: 'hi-IN' } }
  );
  // Changing only the config still produces a model, so the pair stays intact.
  assert.deepStrictEqual(
    resolvePairForUpdate({ assistant_tts_config: { speaker: 'maitreyi' } }, stored, 'tts'),
    { model: 'sarvam', config: { speaker: 'maitreyi' } }
  );
  // Nothing sent, nothing stored: send neither half.
  assert.deepStrictEqual(resolvePairForUpdate({}, null, 'tts'), { model: undefined, config: undefined });
  // The caller can clear a config explicitly.
  assert.deepStrictEqual(
    resolvePairForUpdate({ assistant_tts_config: {} }, stored, 'tts'),
    { model: 'sarvam', config: {} }
  );
  // `native` takes no config fields, so the stored Sarvam `language` is dropped.
  assert.deepStrictEqual(
    resolvePairForUpdate({ assistant_stt_model: 'native' }, stored, 'stt'),
    { model: 'native', config: undefined }
  );
});
