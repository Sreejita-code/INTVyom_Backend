const test = require('node:test');
const assert = require('node:assert');
const {
  SERVICE_NAMES,
  modelsFor,
  keyNameFor,
  classify,
  serviceTypeFor,
  resolveApiKey,
} = require('../../src/integration/providers');

test('keyNameFor maps model -> integration row (case-insensitive)', () => {
  assert.strictEqual(keyNameFor('stt', 'sarvam'), 'sarvam');
  assert.strictEqual(keyNameFor('tts', 'Sarvam'), 'sarvam');
  assert.strictEqual(keyNameFor('llm', 'openai'), 'openai');
  // The cascade STT stage added three providers; two of them share a row with another slot.
  assert.strictEqual(keyNameFor('stt', 'deepgram'), 'deepgram');
  assert.strictEqual(keyNameFor('stt', 'Elevenlabs'), 'elevenlabs');
  assert.strictEqual(keyNameFor('stt', 'openai'), 'openai');
  assert.strictEqual(keyNameFor('stt', 'native'), undefined); // native needs no key
  assert.strictEqual(keyNameFor('tts', undefined), undefined);
  assert.strictEqual(keyNameFor('tts', 'nonsense'), undefined);
});

test('classify reports every kind a shared key backs', () => {
  // A `sarvam` rotation must reach the TTS *and* the STT slot.
  assert.deepStrictEqual(classify('sarvam'), [
    { kind: 'tts', model: 'sarvam' },
    { kind: 'stt', model: 'sarvam' },
  ]);
  // One OpenAI key backs the LLM and the cascade STT stage, so a rotation must reach both.
  assert.deepStrictEqual(classify('openai'), [
    { kind: 'llm', model: 'openai' },
    { kind: 'stt', model: 'openai' },
  ]);
  assert.deepStrictEqual(classify('CARTESIA'), [
    { kind: 'tts', model: 'cartesia' },
    { kind: 'stt', model: 'cartesia' },
  ]);
  assert.deepStrictEqual(classify('elevenlabs'), [
    { kind: 'tts', model: 'elevenlabs' },
    { kind: 'stt', model: 'elevenlabs' },
  ]);
  assert.deepStrictEqual(classify('deepgram'), [{ kind: 'stt', model: 'deepgram' }]);
  assert.strictEqual(classify('nonsense'), undefined);
  assert.strictEqual(classify('sarvam_stt'), undefined); // retired: STT reads the shared row
});

test('serviceTypeFor / modelsFor / SERVICE_NAMES stay consistent', () => {
  // Shared rows must keep the service_type they were stored with before the STT slot grew,
  // or every existing Integration document disagrees with what the code now reports.
  assert.strictEqual(serviceTypeFor('openai'), 'LLM');
  assert.strictEqual(serviceTypeFor('sarvam'), 'TTS');
  assert.strictEqual(serviceTypeFor('elevenlabs'), 'TTS');
  assert.strictEqual(serviceTypeFor('deepgram'), 'STT');
  assert.strictEqual(serviceTypeFor('nonsense'), undefined);
  assert.deepStrictEqual(modelsFor('llm'), ['openai', 'gemini']);
  assert.deepStrictEqual(modelsFor('stt'), [
    'sarvam', 'cartesia', 'deepgram', 'elevenlabs', 'openai',
  ]);
  assert.deepStrictEqual(SERVICE_NAMES, [
    'cartesia', 'deepgram', 'elevenlabs', 'gemini', 'mistral', 'openai', 'sarvam',
  ]);
  // Every name storeApiKey accepts must resolve back to at least one kind.
  SERVICE_NAMES.forEach((name) => assert.ok(classify(name)?.length));
});

test('resolveApiKey without a mapped name never touches the DB', async () => {
  // Unknown name -> keyNameFor returns undefined -> no query -> required:false is fine,
  // and required:true still throws before any DB call.
  assert.strictEqual(await resolveApiKey({ userId: 'u1', kind: 'stt', name: 'native', required: false }), undefined);
  await assert.rejects(
    () => resolveApiKey({ userId: 'u1', kind: 'stt', name: 'native', required: true }),
    /Integration required/
  );
});

test('resolveApiKey throws a 400-tagged error when the row is missing', async () => {
  const Integration = require('../../src/core/db/schemas/integration.model');
  Integration.findOne = async () => null;

  await assert.rejects(
    () => resolveApiKey({ userId: 'u1', kind: 'tts', name: 'sarvam', required: true }),
    /Integration required: Please integrate your sarvam API key/
  );
  assert.strictEqual(
    await resolveApiKey({ userId: 'u1', kind: 'tts', name: 'sarvam', required: false }),
    undefined
  );
});
