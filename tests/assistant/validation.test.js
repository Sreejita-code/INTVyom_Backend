const test = require('node:test');
const assert = require('node:assert');
const {
  validateModelParameters,
  unsupportedKnobReason,
  validateAssistantConfiguration,
} = require('../../src/assistant/assistant.validation');

const cascade = (model, parameters) => validateModelParameters('cascade', 'openai', model, { model, ...parameters });

test('reasoning models reject temperature and accept reasoning_effort', () => {
  assert.strictEqual(cascade('gpt-5-mini', { temperature: 0.7 }).isValid, false);
  assert.match(cascade('gpt-5-mini', { temperature: 0.7 }).message, /temperature is not supported by model 'gpt-5-mini'/);
  assert.strictEqual(cascade('gpt-5-mini', { reasoning_effort: 'low' }).isValid, true);
});

test('chat models reject reasoning_effort and accept temperature', () => {
  assert.strictEqual(cascade('gpt-4.1', { reasoning_effort: 'low' }).isValid, false);
  assert.strictEqual(cascade('gpt-4.1', { temperature: 0.7 }).isValid, true);
});

test('the retired *-chat-latest aliases, chat-latest and gpt-oss-120b are off the cascade allowlist', () => {
  // Retired by OpenAI on 2026-06-19 (aliases) or never served by api.openai.com (the other two).
  // A stored row holding one answers calls with silence; new writes are rejected outright.
  for (const model of ['gpt-5.1-chat-latest', 'gpt-5.2-chat-latest', 'gpt-5.3-chat-latest', 'chat-latest', 'gpt-oss-120b']) {
    assert.strictEqual(cascade(model, { temperature: 0.7 }).isValid, false, `${model} should be rejected`);
    assert.strictEqual(cascade(model, { reasoning_effort: 'low' }).isValid, false, `${model} should be rejected`);
  }
});

test('service_tier: scale is rejected everywhere, flex is gpt-5 generation only', () => {
  assert.strictEqual(cascade('gpt-4.1', { service_tier: 'scale' }).isValid, false);
  assert.match(cascade('gpt-4.1', { service_tier: 'scale' }).message, /not an OpenAI tier/);
  // flex on a chat model is the config that produced the silent calls.
  assert.strictEqual(cascade('gpt-4.1', { service_tier: 'flex' }).isValid, false);
  assert.match(cascade('gpt-4.1', { service_tier: 'flex' }).message, /gpt-5 generation/);
  // flex on a reasoning model is fine.
  assert.strictEqual(cascade('gpt-5-mini', { service_tier: 'flex' }).isValid, true);
  // the everyday tiers work on both families.
  for (const tier of ['auto', 'default', 'fast', 'priority']) {
    assert.strictEqual(cascade('gpt-4.1', { service_tier: tier }).isValid, true);
    assert.strictEqual(cascade('gpt-5-mini', { service_tier: tier }).isValid, true);
  }
});

test('tool_choice: only auto/required/none, and "required" needs a tool', () => {
  assert.strictEqual(cascade('gpt-4.1', { tool_choice: 'auto' }).isValid, true);
  assert.strictEqual(cascade('gpt-4.1', { tool_choice: 'nonsense' }).isValid, false);
  // no tools attached: forced choice is refused — OpenAI rejects it on every turn.
  assert.strictEqual(cascade('gpt-4.1', { tool_choice: 'required' }).isValid, false);
  assert.match(cascade('gpt-4.1', { tool_choice: 'required' }).message, /needs at least one tool/);
  // tool_ids inside the parameters count (direct-call back-compat)...
  assert.strictEqual(cascade('gpt-4.1', { tool_choice: 'required', tool_ids: ['t1'] }).isValid, true);
  // ...and so does the top-level end-call tool passed as hasTools.
  assert.strictEqual(
    validateModelParameters('cascade', 'openai', 'gpt-4.1', { model: 'gpt-4.1', tool_choice: 'required' }, true).isValid,
    true
  );
  assert.strictEqual(
    validateModelParameters('cascade', 'openai', 'gpt-4.1', { model: 'gpt-4.1', tool_choice: 'required' }, false).isValid,
    false
  );
});

test('gpt-5.2 with tools is refused via the top-level end-call flag, not only inline tool_ids', () => {
  // The real payload carries assistant_end_call_enabled at the top level, never inside
  // assistant_llm_config — the hasTools flag must come from there.
  assert.strictEqual(
    validateModelParameters('cascade', 'openai', 'gpt-5.2', { model: 'gpt-5.2', reasoning_effort: 'low' }, true).isValid,
    false
  );
  assert.strictEqual(
    validateModelParameters('cascade', 'openai', 'gpt-5.2', { model: 'gpt-5.2', reasoning_effort: 'low' }, false).isValid,
    true
  );
});

test('gpt-5.2 and gpt-5.4* refuse reasoning_effort only once tools are attached', () => {
  for (const model of ['gpt-5.2', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano']) {
    assert.strictEqual(cascade(model, { reasoning_effort: 'low' }).isValid, true, `${model} toolless`);
    assert.strictEqual(cascade(model, { reasoning_effort: 'low', tool_ids: ['t1'] }).isValid, false, `${model} with tools`);
    assert.strictEqual(
      cascade(model, { reasoning_effort: 'low', assistant_end_call_enabled: true }).isValid,
      false,
      `${model} with the built-in end_call tool`
    );
  }
  // gpt-5-mini is not in that set — tools change nothing for it.
  assert.strictEqual(cascade('gpt-5-mini', { reasoning_effort: 'low', tool_ids: ['t1'] }).isValid, true);
});

test('a null knob is not a set knob', () => {
  assert.strictEqual(cascade('gpt-5-mini', { temperature: null }).isValid, true);
});

test('an unknown model is never guessed at', () => {
  assert.strictEqual(unsupportedKnobReason('gpt-9-turbo', 'temperature'), null);
  assert.strictEqual(unsupportedKnobReason('gpt-9-turbo', 'verbosity'), null);
});

test('an explicitly null config is nothing to validate, not a crash', () => {
  // Realtime drops the speech pipeline by sending null for both halves; a null llm_config is
  // the same story. Destructuring defaults only cover undefined, so these used to 500.
  const realtime = {
    assistant_mode: 'realtime',
    assistant_llm_config: { provider: 'openai', model: 'gpt-realtime-1.5' },
    assistant_stt_model: null,
    assistant_stt_config: null,
    assistant_tts_model: null,
    assistant_tts_config: null,
  };

  assert.strictEqual(validateAssistantConfiguration(realtime).isValid, true);
  assert.strictEqual(
    validateAssistantConfiguration({ ...realtime, assistant_llm_config: null }).isValid,
    true
  );
});

test('the Sarvam TTS language roster is separate from the 24-code Sarvam STT roster', () => {
  // 'as-IN' is a valid Sarvam STT code but bulbul:v3 does not speak it — an unlisted code is
  // substituted with en-IN upstream, so the assistant would speak a language nobody chose.
  const ttsOnly = validateAssistantConfiguration({
    assistant_mode: 'pipeline',
    assistant_llm_config: { provider: 'openai', model: 'gpt-realtime-1.5' },
    assistant_tts_model: 'sarvam',
    assistant_tts_config: { speaker: 'shubh', target_language_code: 'as-IN' },
  });
  assert.strictEqual(ttsOnly.isValid, false);
  assert.match(ttsOnly.message, /not spoken by bulbul:v3/);

  // The same code stays valid on the STT half, which keeps the 24-code roster.
  const sttOnly = validateAssistantConfiguration({
    assistant_mode: 'pipeline',
    assistant_llm_config: { provider: 'openai', model: 'gpt-realtime-1.5' },
    assistant_stt_model: 'sarvam',
    assistant_stt_config: { language: 'as-IN' },
  });
  assert.strictEqual(sttOnly.isValid, true);
});

test('a language code inside a present config is still validated', () => {
  const result = validateAssistantConfiguration({
    assistant_mode: 'pipeline',
    assistant_llm_config: { provider: 'openai', model: 'gpt-realtime-1.5' },
    assistant_stt_model: 'sarvam',
    assistant_stt_config: { language: 'not-a-code' },
  });

  assert.strictEqual(result.isValid, false);
});

// --- duplex mode (GPT-Live) -------------------------------------------------------------------

const duplex = (extra = {}) => validateAssistantConfiguration({
  assistant_mode: 'duplex',
  assistant_llm_config: { provider: 'openai' },
  ...extra,
});

test('duplex accepts the defaults, a TTS-free config and a reasoning backend', () => {
  assert.strictEqual(duplex().isValid, true);
  assert.strictEqual(duplex({
    assistant_llm_config: {
      provider: 'openai', model: 'gpt-live-1', voice: 'cedar',
      backend_model: 'gpt-5.5', backend_instructions: 'Answer briefly.', reasoning_effort: 'low',
    },
  }).isValid, true);
});

test('duplex rejects gemini, a realtime model id, a foreign voice and a chat backend', () => {
  assert.match(duplex({ assistant_llm_config: { provider: 'gemini' } }).message, /not supported in duplex mode/);
  assert.match(duplex({ assistant_llm_config: { provider: 'openai', model: 'gpt-realtime-1.5' } }).message, /only value is 'gpt-live-1'/);
  assert.match(duplex({ assistant_llm_config: { provider: 'openai', voice: 'alloy' } }).message, /not a GPT-Live voice/);
  assert.match(duplex({ assistant_llm_config: { provider: 'openai', backend_model: 'gpt-4.1' } }).message, /not a reasoning model/);
});

test('duplex refuses what GPT-Live cannot say: greeting audio and filler words', () => {
  assert.match(
    duplex({ assistant_greeting_audio: { enabled: true, audio_id: 'a1' } }).message,
    /assistant_greeting_audio cannot be enabled in duplex mode/
  );
  assert.match(
    duplex({ assistant_interaction_config: { filler_words: true } }).message,
    /filler_words cannot be true in duplex mode/
  );
  // Disabled / false is the documented way through.
  assert.strictEqual(duplex({
    assistant_greeting_audio: { enabled: false },
    assistant_interaction_config: { filler_words: false },
  }).isValid, true);
});

test('duplex checks the generation knobs against backend_model, and never takes temperature', () => {
  assert.match(
    duplex({ assistant_llm_config: { provider: 'openai', temperature: 0.3 } }).message,
    /temperature is not supported by model 'gpt-5.6-luna'/
  );
  assert.strictEqual(
    duplex({ assistant_llm_config: { provider: 'openai', backend_model: 'gpt-5-mini', service_tier: 'flex' } }).isValid,
    true
  );
  assert.match(
    duplex({ assistant_llm_config: { provider: 'openai', backend_instructions: 'x'.repeat(4001) } }).message,
    /at most 4000 characters/
  );
});

test('gpt-6 is a reasoning model: reasoning_effort and verbosity yes, temperature no', () => {
  for (const model of ['gpt-6-luna', 'gpt-6-sol']) {
    assert.strictEqual(cascade(model, { reasoning_effort: 'low', verbosity: 'low', service_tier: 'flex' }).isValid, true);
    assert.match(cascade(model, { temperature: 0.5 }).message, /reasoning models reject temperature/);
  }
});

test('a stored gpt-5.1 row stays editable: the knob checks still know its family, only a request naming it is refused', () => {
  // This runs against the merged stored row on every PATCH, so it must not lock the owner out.
  assert.strictEqual(cascade('gpt-5.1', { reasoning_effort: 'low' }).isValid, true);
  assert.match(cascade('gpt-5.4-nano', { temperature: 0.5 }).message, /reasoning models reject temperature/);
  // ...but a duplex backend is a new choice and must be a current model.
  assert.match(
    validateAssistantConfiguration({
      assistant_mode: 'duplex',
      assistant_llm_config: { provider: 'openai', backend_model: 'gpt-5.1' },
    }).message,
    /not a reasoning model/
  );
});

test('Gemini realtime refuses the five knobs Gemini Live ignores, naming each one', () => {
  const gemini = (parameters) => validateModelParameters('realtime', 'gemini', 'gemini-3.8-live', parameters);

  for (const knob of ['reasoning_effort', 'verbosity', 'service_tier', 'tool_choice', 'parallel_tool_calls']) {
    const result = gemini({ [knob]: knob === 'parallel_tool_calls' ? true : 'low' });
    assert.strictEqual(result.isValid, false, knob);
    assert.match(result.message, new RegExp(`assistant_llm_config\\.${knob} is not supported by Gemini Live`));
  }
  assert.match(gemini({ verbosity: 'low', service_tier: 'fast' }).message, /verbosity, service_tier are not supported/);
});

test('Gemini realtime still takes temperature and max_output_tokens, and a null clears a refused knob', () => {
  const gemini = (parameters) => validateModelParameters('realtime', 'gemini', 'gemini-3.8-live', parameters);

  assert.strictEqual(gemini({ temperature: 0.4, max_output_tokens: 500 }).isValid, true);
  assert.strictEqual(gemini({ service_tier: null }).isValid, true);
});

test('the Gemini refusal is realtime-only: OpenAI realtime and legacy gemini/pipeline rows are untouched', () => {
  assert.strictEqual(
    validateModelParameters('realtime', 'openai', 'gpt-realtime-1.5', { service_tier: 'fast', tool_choice: 'auto' }).isValid,
    true
  );
  // A retired gemini/pipeline row must stay editable.
  assert.strictEqual(
    validateModelParameters('pipeline', 'gemini', 'gemini-3.8-live', { service_tier: 'fast' }).isValid,
    true
  );
});

test('a realtime assistant that defaults to Gemini is refused through the full configuration check', () => {
  const result = validateAssistantConfiguration({
    assistant_mode: 'realtime',
    assistant_llm_config: { model: 'gemini-3.8-live', reasoning_effort: 'low' },
  });
  assert.strictEqual(result.isValid, false);
  assert.match(result.message, /reasoning_effort is not supported by Gemini Live/);
});
