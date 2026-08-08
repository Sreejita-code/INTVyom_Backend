const test = require('node:test');
const assert = require('node:assert');

// Provider key resolution is the builder's only I/O — stub it before requiring the
// builder, which destructures these functions at load time.
const providers = require('../../src/integration/providers');
providers.resolveApiKey = async ({ kind, name, required }) => {
  if (name === 'gemini') return required ? 'gemini-key' : null;
  return `${kind}-${name}-key`;
};

const {
  buildPipelineTtsConfig,
  buildPipelineSttConfig,
  resolveProvider,
  buildLlmConfig,
} = require('../../src/assistant/assistant.builder');

test('buildPipelineTtsConfig injects the integrated key, overriding any caller key', async () => {
  assert.deepStrictEqual(
    await buildPipelineTtsConfig({ userId: 'u1', ttsModel: 'sarvam', ttsConfig: { speaker: 'anushka', api_key: 'caller' } }),
    { speaker: 'anushka', api_key: 'tts-sarvam-key' }
  );
  // No config sent: the key alone is the config.
  assert.deepStrictEqual(
    await buildPipelineTtsConfig({ userId: 'u1', ttsModel: 'cartesia' }),
    { api_key: 'tts-cartesia-key' }
  );
  // No model, nothing to resolve.
  assert.strictEqual(await buildPipelineTtsConfig({ userId: 'u1' }), undefined);
});

test('buildPipelineSttConfig leaves keyless models untouched', async () => {
  // `native` has no provider-map entry, so its config is forwarded verbatim.
  assert.deepStrictEqual(
    await buildPipelineSttConfig({ userId: 'u1', sttModel: 'native', sttConfig: { language: 'hi-IN' } }),
    { language: 'hi-IN' }
  );
  assert.strictEqual(await buildPipelineSttConfig({ userId: 'u1', sttModel: 'native' }), undefined);
  assert.deepStrictEqual(
    await buildPipelineSttConfig({ userId: 'u1', sttModel: 'sarvam', sttConfig: { language: 'hi-IN' } }),
    { language: 'hi-IN', api_key: 'stt-sarvam-key' }
  );
});

test('buildPipelineTtsConfig does not mutate the caller config', async () => {
  const ttsConfig = { speaker: 'anushka' };
  await buildPipelineTtsConfig({ userId: 'u1', ttsModel: 'sarvam', ttsConfig });
  assert.deepStrictEqual(ttsConfig, { speaker: 'anushka' });
});

test('resolveProvider is mode-aware and rejects unknown providers', () => {
  assert.strictEqual(resolveProvider({ mode: 'realtime', modeExplicit: true }), 'gemini');
  assert.strictEqual(resolveProvider({ mode: 'pipeline', modeExplicit: true }), 'openai');
  assert.strictEqual(resolveProvider({ llmConfig: { provider: 'GEMINI' }, mode: 'realtime' }), 'gemini');
  assert.strictEqual(resolveProvider({ llmConfig: { provider: 'openai' }, mode: 'realtime' }), 'openai');
  assert.throws(() => resolveProvider({ llmConfig: { provider: 'gemini' }, mode: 'cascade' }), /cascade/);
  assert.throws(() => resolveProvider({ llmConfig: { provider: 'llama' }, mode: 'pipeline' }), /provider must be/);

  // Gemini is realtime-only: pipeline is a half-cascade and needs a text-only response
  // modality, which Google's Live API cannot do on its native-audio models.
  assert.throws(
    () => resolveProvider({ llmConfig: { provider: 'gemini' }, mode: 'pipeline' }),
    /not supported in pipeline mode/
  );
  // Naming a mode without a provider resets to that mode's default rather than carrying the
  // stored one forward — so an explicit switch to pipeline lands on openai, not gemini.
  assert.strictEqual(
    resolveProvider({ existing: { llm_provider: 'gemini' }, mode: 'pipeline', modeExplicit: true }),
    'openai'
  );

  // A PATCH that names neither a provider nor a mode still resolves the stored value:
  // an assistant left on the retired gemini/pipeline pairing must stay editable (rename,
  // prompt edit) so its owner can fix it, instead of 400-ing on every request.
  assert.strictEqual(resolveProvider({ existing: { llm_provider: 'gemini' }, mode: 'pipeline' }), 'gemini');
});

test('buildLlmConfig prefers a caller key and drops the key when none resolves', async () => {
  assert.deepStrictEqual(
    await buildLlmConfig({ userId: 'u1', llmConfig: { model: 'gpt-4o', api_key: 'sk-caller' }, provider: 'openai' }),
    { model: 'gpt-4o', api_key: 'sk-caller', provider: 'openai' }
  );
  assert.deepStrictEqual(
    await buildLlmConfig({ userId: 'u1', llmConfig: { model: 'gpt-4o' }, provider: 'openai' }),
    { model: 'gpt-4o', provider: 'openai', api_key: 'llm-openai-key' }
  );
  // Optional key that does not resolve must not leave an empty api_key behind.
  assert.deepStrictEqual(
    await buildLlmConfig({ userId: 'u1', llmConfig: {}, provider: 'gemini', keyRequired: false }),
    { provider: 'gemini' }
  );
});
