const test = require('node:test');
const assert = require('node:assert');
const {
  validateModelParameters,
  unsupportedKnobReason,
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

test('*-chat-latest is a chat model, not a reasoning one', () => {
  // The prefix test this replaced matched these ids in BOTH families, so temperature and
  // reasoning_effort were rejected together and neither knob could be configured.
  for (const model of ['gpt-5.1-chat-latest', 'gpt-5.2-chat-latest', 'gpt-5.3-chat-latest', 'chat-latest']) {
    assert.strictEqual(cascade(model, { temperature: 0.7 }).isValid, true, `${model} should take temperature`);
    assert.strictEqual(cascade(model, { reasoning_effort: 'low' }).isValid, false, `${model} should refuse reasoning_effort`);
    // Still the gpt-5 generation for verbosity.
    assert.strictEqual(cascade(model, { verbosity: 'low' }).isValid, true, `${model} should take verbosity`);
  }
});

test('verbosity is allowlisted to the gpt-5 generation', () => {
  assert.strictEqual(cascade('gpt-5', { verbosity: 'low' }).isValid, true);
  assert.strictEqual(cascade('gpt-4o', { verbosity: 'low' }).isValid, false);
  // The old denylist named only gpt-4.1*/gpt-4o*, so this one slipped through.
  assert.strictEqual(cascade('gpt-oss-120b', { verbosity: 'low' }).isValid, false);
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
