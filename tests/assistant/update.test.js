const test = require('node:test');
const assert = require('node:assert');

// assistant.update.js destructures its dependencies at load time, so every stub has to
// land in the require cache BEFORE it is required.
const stubModule = (request, exports) => {
  const filename = require.resolve(request);
  require.cache[filename] = { id: filename, filename, loaded: true, exports, children: [], paths: [] };
};

// Records what the upstream and the DB were asked to do.
const sent = { patch: null, localUpdate: null };
let storedAssistant = null;

stubModule('../../src/services/livekit/livekitService', {
  EXTERNAL_BASE: 'https://stub',
  callExternal: async (apiKey, opts) => {
    sent.patch = { apiKey, ...opts };
    return { success: true };
  },
});

stubModule('../../src/auth/userAccess', async () => ({ _id: 'u1', api_key: 'user-key' }));

stubModule('../../src/core/db/schemas/assistant.model', {
  findOne: async () => storedAssistant,
  findOneAndUpdate: async (_filter, update) => {
    sent.localUpdate = update.$set;
    return { ...storedAssistant, ...update.$set };
  },
});

const providers = require('../../src/integration/providers');
providers.resolveApiKey = async ({ kind, name }) => `${kind}-${name}-key`;

const { updateAssistant } = require('../../src/assistant/assistant.update');

test.beforeEach(() => {
  sent.patch = null;
  sent.localUpdate = null;
  storedAssistant = {
    external_assistant_id: 'ext-1',
    llm_mode: 'pipeline',
    llm_provider: 'openai',
    tts_model: 'sarvam',
    tts_config: { speaker: 'anushka' },
    stt_model: 'sarvam',
    stt_config: { language: 'hi-IN' },
    toObject() { return this; },
  };
});

test('a name-only update sends just that field and no mode or pipeline config', async () => {
  const result = await updateAssistant('u1', 'ext-1', { assistant_name: 'Renamed' });

  assert.strictEqual(sent.patch.method, 'patch');
  assert.strictEqual(sent.patch.path, '/assistant/update/ext-1');
  assert.deepStrictEqual(sent.patch.data, { assistant_name: 'Renamed' });
  assert.deepStrictEqual(sent.localUpdate, { name: 'Renamed' });
  assert.strictEqual(result.success, true);
  assert.deepStrictEqual(result.data, { assistant_id: 'ext-1' });
});

test('a TTS config edit goes out as a model+config pair with the integrated key', async () => {
  await updateAssistant('u1', 'ext-1', { assistant_tts_config: { speaker: 'shubh' } });

  assert.strictEqual(sent.patch.data.assistant_tts_model, 'sarvam');
  assert.deepStrictEqual(sent.patch.data.assistant_tts_config, {
    speaker: 'shubh',
    api_key: 'tts-sarvam-key',
  });
  // Mode was derived from the payload, so it is pushed and mirrored locally.
  assert.strictEqual(sent.patch.data.assistant_mode, 'pipeline');
  assert.strictEqual(sent.localUpdate.llm_mode, 'pipeline');
  // The resolved key is an upstream concern — never persisted locally.
  assert.deepStrictEqual(sent.localUpdate.tts_config, { speaker: 'shubh' });
});

test('switching to realtime strips the speech pipeline and requires an llm_config', async () => {
  await assert.rejects(
    () => updateAssistant('u1', 'ext-1', { assistant_mode: 'realtime' }),
    /assistant_llm_config is required/
  );

  await updateAssistant('u1', 'ext-1', {
    assistant_mode: 'realtime',
    assistant_llm_config: { model: 'gemini-2.5-flash-native-audio-preview-12-2025' },
  });

  assert.strictEqual(sent.patch.data.assistant_mode, 'realtime');
  assert.strictEqual(sent.patch.data.assistant_tts_model, undefined);
  assert.strictEqual(sent.patch.data.assistant_tts_config, undefined);
  assert.strictEqual(sent.patch.data.assistant_stt_model, undefined);
  assert.strictEqual(sent.patch.data.assistant_stt_config, undefined);
  assert.deepStrictEqual(sent.patch.data.assistant_llm_config, {
    model: 'gemini-2.5-flash-native-audio-preview-12-2025',
    provider: 'gemini',
    api_key: 'llm-gemini-key',
  });
  assert.strictEqual(sent.localUpdate.llm_mode, 'realtime');
  assert.strictEqual(sent.localUpdate.llm_provider, 'gemini');
});

test('cascade rejects the native STT model', async () => {
  storedAssistant.llm_mode = 'cascade';
  storedAssistant.stt_model = 'native';

  await assert.rejects(
    () => updateAssistant('u1', 'ext-1', { assistant_stt_config: { language: 'hi-IN' } }),
    /must be one of .* in cascade mode/
  );
  // Nothing reached the upstream.
  assert.strictEqual(sent.patch, null);
});

test('a stored gemini assistant cannot be switched to pipeline or cascade in one hop', async () => {
  storedAssistant.llm_mode = 'realtime';
  storedAssistant.llm_provider = 'gemini';

  for (const mode of ['pipeline', 'cascade']) {
    await assert.rejects(
      () => updateAssistant('u1', 'ext-1', { assistant_mode: mode }),
      /cannot run on the stored LLM provider 'gemini'/
    );
    assert.strictEqual(sent.patch, null);
  }

  // A TTS edit infers a mode too, and that inferred mode hits the same wall.
  await assert.rejects(
    () => updateAssistant('u1', 'ext-1', { assistant_tts_model: 'sarvam' }),
    /cannot run on the stored LLM provider 'gemini'/
  );
  assert.strictEqual(sent.patch, null);

  // Sending the corrected provider in the SAME request is the documented way through.
  await updateAssistant('u1', 'ext-1', {
    assistant_mode: 'cascade',
    assistant_llm_config: { provider: 'openai', model: 'gpt-4.1-mini' },
  });
  assert.strictEqual(sent.patch.data.assistant_llm_config.provider, 'openai');
  assert.strictEqual(sent.localUpdate.llm_provider, 'openai');
});

test('an existing gemini/pipeline assistant stays editable', async () => {
  // The pairing is retired upstream, but a rename must not 400 — that would lock the owner
  // out of the very assistant they need to fix.
  storedAssistant.llm_provider = 'gemini';

  await updateAssistant('u1', 'ext-1', { assistant_name: 'Renamed' });
  assert.deepStrictEqual(sent.patch.data, { assistant_name: 'Renamed' });
});

test('a cascade LLM model from the realtime family is rejected before any call', async () => {
  storedAssistant.llm_mode = 'cascade';

  await assert.rejects(
    () => updateAssistant('u1', 'ext-1', {
      assistant_llm_config: { provider: 'openai', model: 'gpt-realtime-1.5' },
    }),
    /not valid in cascade mode/
  );
  assert.strictEqual(sent.patch, null);
});

test('the retired assistant_llm_mode alias is rejected before any call', async () => {
  await assert.rejects(
    () => updateAssistant('u1', 'ext-1', { assistant_llm_mode: 'realtime' }),
    /retired/
  );
  assert.strictEqual(sent.patch, null);
});

test('a stored chat-model temperature blocks a model-only switch to a reasoning model', async () => {
  // The docs' merged-row rule: a PATCH naming only `model` keeps the stored knobs, so the
  // stored temperature must be validated against the new model. Before the key-by-key merge
  // this passed local validation and failed upstream on every LLM turn.
  storedAssistant.llm_mode = 'cascade';
  storedAssistant.llm_config = { model: 'gpt-4.1', temperature: 0.7 };

  await assert.rejects(
    () => updateAssistant('u1', 'ext-1', { assistant_llm_config: { model: 'gpt-5-mini' } }),
    /temperature is not supported by model 'gpt-5-mini'/
  );
  assert.strictEqual(sent.patch, null);

  // Clearing the knob in the same request is the documented way through.
  await updateAssistant('u1', 'ext-1', {
    assistant_llm_config: { model: 'gpt-5-mini', temperature: null },
  });
  assert.strictEqual(sent.patch.data.assistant_llm_config.model, 'gpt-5-mini');
  assert.strictEqual(sent.patch.data.assistant_llm_config.temperature, null);
});

test('switching provider leaves a gemini voice behind — caught against the merged config', async () => {
  storedAssistant.llm_mode = 'realtime';
  storedAssistant.llm_provider = 'gemini';
  storedAssistant.llm_config = { provider: 'gemini', model: 'gemini-2.5-flash-native-audio-preview-12-2025', voice: 'Puck' };

  await assert.rejects(
    () => updateAssistant('u1', 'ext-1', {
      assistant_llm_config: { provider: 'openai', model: 'gpt-realtime-1.5' },
    }),
    /is a Gemini Live voice and is not accepted under provider 'openai'/
  );
  assert.strictEqual(sent.patch, null);

  // Clearing the voice in the same request is the way through.
  await updateAssistant('u1', 'ext-1', {
    assistant_llm_config: { provider: 'openai', model: 'gpt-realtime-1.5', voice: null },
  });
  assert.strictEqual(sent.patch.data.assistant_llm_config.provider, 'openai');
});

test('a sarvam v2 speaker sent on update is refused before any call', async () => {
  await assert.rejects(
    () => updateAssistant('u1', 'ext-1', {
      assistant_tts_config: { speaker: 'anushka' },
    }),
    /not available on bulbul:v3/
  );
  assert.strictEqual(sent.patch, null);
});

test('switching to pipeline with no stored TTS demands the pair', async () => {
  storedAssistant.tts_model = undefined;
  storedAssistant.tts_config = undefined;

  await assert.rejects(
    () => updateAssistant('u1', 'ext-1', { assistant_mode: 'cascade' }),
    /assistant_tts_model and assistant_tts_config are required/
  );
  assert.strictEqual(sent.patch, null);

  // With the pair in the same request it goes through.
  await updateAssistant('u1', 'ext-1', {
    assistant_mode: 'cascade',
    assistant_tts_model: 'sarvam',
    assistant_tts_config: { speaker: 'shubh' },
  });
  assert.strictEqual(sent.patch.data.assistant_mode, 'cascade');
});

test('an unrelated rename on a legacy row without TTS stays editable', async () => {
  storedAssistant.tts_model = undefined;
  storedAssistant.tts_config = undefined;

  await updateAssistant('u1', 'ext-1', { assistant_name: 'Renamed' });
  assert.deepStrictEqual(sent.patch.data, { assistant_name: 'Renamed' });
});

test('a rename-only PATCH on a row holding a dead STT model still succeeds', async () => {
  // The repair path must stay open: the request never resends stt_config.model, and the model-id
  // asserts only fire on values actually present in the request.
  storedAssistant.stt_config = { model: 'saaras:v2.5', language: 'hi-IN' };

  await updateAssistant('u1', 'ext-1', { assistant_name: 'Renamed' });
  assert.deepStrictEqual(sent.patch.data, { assistant_name: 'Renamed' });
});

test('a rename-only PATCH on a row holding an out-of-roster Sarvam TTS language still succeeds', async () => {
  // The same guarantee for the language split: a stored 'as-IN' (a valid Sarvam STT code, not a
  // bulbul:v3 code) must not lock the owner out of renaming.
  storedAssistant.tts_config = { speaker: 'shubh', target_language_code: 'as-IN' };

  await updateAssistant('u1', 'ext-1', { assistant_name: 'Renamed' });
  assert.deepStrictEqual(sent.patch.data, { assistant_name: 'Renamed' });

  // Resending the offending field is rejected — the fix is a valid code, not an omission.
  await assert.rejects(
    () => updateAssistant('u1', 'ext-1', {
      assistant_tts_config: { speaker: 'shubh', target_language_code: 'as-IN' },
    }),
    /not spoken by bulbul:v3/
  );
});

test('false and null are mirrored locally; undefined is not', async () => {
  await updateAssistant('u1', 'ext-1', {
    assistant_end_call_enabled: false,
    assistant_end_call_url: null,
    assistant_prompt: undefined,
  });

  assert.deepStrictEqual(sent.localUpdate, { end_call_enabled: false, end_call_url: null });
});

test('a partial end_call_webhook PATCH is merged into the stored object, as upstream does', async () => {
  storedAssistant.end_call_webhook = { timeout_seconds: 30, attempts: 3 };

  await updateAssistant('u1', 'ext-1', { assistant_end_call_webhook: { timeout_seconds: 60 } });

  // Upstream receives only what was sent; the local mirror keeps the untouched key.
  assert.deepStrictEqual(sent.patch.data, { assistant_end_call_webhook: { timeout_seconds: 60 } });
  assert.deepStrictEqual(sent.localUpdate.end_call_webhook, { timeout_seconds: 60, attempts: 3 });
});

test('every documented update example in swagger.yaml passes local validation', async () => {
  // Copy-ready payloads from the /mcp docs server, applied to the stored pipeline/sarvam row.
  const YAML = require('yamljs');
  const doc = YAML.load(require('node:path').join(__dirname, '..', '..', 'swagger.yaml'));
  const examples = doc.paths['/api/assistant/update/{id}'].patch.requestBody.content['application/json'].examples;

  for (const [name, { value }] of Object.entries(examples)) {
    await assert.doesNotReject(() => updateAssistant('u1', 'ext-1', value), name);
  }
});
