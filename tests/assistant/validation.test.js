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

test('a language code inside a present config is still validated', () => {
  const result = validateAssistantConfiguration({
    assistant_mode: 'pipeline',
    assistant_llm_config: { provider: 'openai', model: 'gpt-realtime-1.5' },
    assistant_stt_model: 'sarvam',
    assistant_stt_config: { language: 'not-a-code' },
  });

  assert.strictEqual(result.isValid, false);
});
