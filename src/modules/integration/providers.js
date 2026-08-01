const Integration = require('./integration.model');

// Canonical map: model/provider name -> the Integration `service_name` row holding its key.
//
// This is the single source of truth. Anything that needs to know "which row holds the key
// for X" reads it from here — assistant create, assistant update, and the post-rotation
// re-sync all go through resolveApiKey()/classify() below.
//
// Sarvam issues one API key that serves both STT and TTS, so both kinds point at the same
// `sarvam` row. That is also why classify('sarvam') reports two targets.
const PROVIDER_KEYS = {
  tts: {
    sarvam: 'sarvam',
    cartesia: 'cartesia',
    elevenlabs: 'elevenlabs',
    mistral: 'mistral',
  },
  stt: {
    sarvam: 'sarvam',
    cartesia: 'cartesia',
    // ponytail: `native` deliberately absent — the external API supplies its own STT,
    // so no key is resolved and the caller's config is forwarded verbatim.
  },
  llm: {
    openai: 'openai',
    gemini: 'gemini',
  },
};

// service_type values accepted by integration.model.js
const SERVICE_TYPE_BY_KIND = { tts: 'TTS', stt: 'STT', llm: 'LLM' };

// Reverse index, built once: service_name -> [{ kind, model }, ...].
// One row can back more than one kind (a shared vendor key such as `sarvam`).
const KIND_BY_SERVICE_NAME = (() => {
  const index = new Map();
  for (const [kind, models] of Object.entries(PROVIDER_KEYS)) {
    for (const [model, name] of Object.entries(models)) {
      if (!index.has(name)) index.set(name, []);
      index.get(name).push({ kind, model });
    }
  }
  return index;
})();

const SERVICE_NAMES = [...KIND_BY_SERVICE_NAME.keys()].sort();

const modelsFor = (kind) => Object.keys(PROVIDER_KEYS[kind] || {});

// Which row holds this model's key. `undefined` means the model needs no integration at
// all — callers must forward the config untouched in that case.
const keyNameFor = (kind, name) => {
  if (typeof name !== 'string') return undefined;
  return PROVIDER_KEYS[kind]?.[name.toLowerCase()];
};

// What a stored service_name is good for. `undefined` for names we don't know.
const classify = (serviceName) => {
  if (typeof serviceName !== 'string') return undefined;
  return KIND_BY_SERVICE_NAME.get(serviceName.toLowerCase());
};

const serviceTypeFor = (serviceName) => {
  const targets = classify(serviceName);
  if (!targets) return undefined;
  // A shared row is reported under the first kind that declared it (tts before stt),
  // matching how these rows were typed before the map existed.
  return SERVICE_TYPE_BY_KIND[targets[0].kind];
};

const integrationRequired = (label) => {
  const error = new Error(
    `Integration required: Please integrate your ${label} API key in the Integrations module first.`
  );
  error.status = 400;
  return error;
};

// Resolve the stored key for (user, kind, model). Throws a 400-tagged error when the row is
// missing or holds no usable key. `label` only affects the message (keeps the caller's casing).
// `required: false` returns undefined instead of throwing — for slots where the external API
// falls back to its own system key (pipeline LLM), so a missing integration isn't fatal.
const resolveApiKey = async ({ userId, kind, name, label = name, required = true }) => {
  const serviceName = keyNameFor(kind, name);
  const row = serviceName
    ? await Integration.findOne({ user_id: userId, service_name: serviceName })
    : null;

  const apiKey = row?.api_key?.trim() ? row.api_key : undefined;
  if (!apiKey && required) throw integrationRequired(label);
  return apiKey;
};

module.exports = {
  PROVIDER_KEYS,
  SERVICE_NAMES,
  modelsFor,
  keyNameFor,
  classify,
  serviceTypeFor,
  resolveApiKey,
};

// ponytail: assert-based self-check, no framework. `node src/modules/integration/providers.js`
if (require.main === module) {
  const assert = require('assert');

  // One row per provider; sarvam backs both directions with the same key.
  assert.strictEqual(keyNameFor('stt', 'sarvam'), 'sarvam');
  assert.strictEqual(keyNameFor('tts', 'Sarvam'), 'sarvam');
  assert.strictEqual(keyNameFor('llm', 'openai'), 'openai');
  assert.strictEqual(keyNameFor('stt', 'native'), undefined);
  assert.strictEqual(keyNameFor('tts', undefined), undefined);
  assert.strictEqual(keyNameFor('tts', 'nonsense'), undefined);

  // The one that matters: a `sarvam` rotation must reach the TTS *and* the STT slot, or
  // half of every affected assistant keeps running on the dead key.
  assert.deepStrictEqual(classify('sarvam'), [
    { kind: 'tts', model: 'sarvam' },
    { kind: 'stt', model: 'sarvam' },
  ]);
  assert.deepStrictEqual(classify('openai'), [{ kind: 'llm', model: 'openai' }]);
  assert.deepStrictEqual(classify('CARTESIA'), [
    { kind: 'tts', model: 'cartesia' },
    { kind: 'stt', model: 'cartesia' },
  ]);
  assert.strictEqual(classify('nonsense'), undefined);
  assert.strictEqual(classify('sarvam_stt'), undefined); // retired: STT reads the shared row

  assert.strictEqual(serviceTypeFor('openai'), 'LLM');
  assert.strictEqual(serviceTypeFor('sarvam'), 'TTS');
  assert.strictEqual(serviceTypeFor('nonsense'), undefined);

  assert.deepStrictEqual(modelsFor('llm'), ['openai', 'gemini']);
  assert.deepStrictEqual(modelsFor('stt'), ['sarvam', 'cartesia']);
  assert.deepStrictEqual(SERVICE_NAMES, [
    'cartesia', 'elevenlabs', 'gemini', 'mistral', 'openai', 'sarvam',
  ]);
  // Every name storeApiKey accepts must resolve back to at least one kind.
  SERVICE_NAMES.forEach((name) => assert.ok(classify(name)?.length));

  // One message shape for every kind — there is no separate STT key to point at.
  assert.throws(
    () => { throw integrationRequired('sarvam'); },
    /^Error: Integration required: Please integrate your sarvam API key in the Integrations module first\.$/
  );
  assert.strictEqual(integrationRequired('openai').status, 400);

  console.log('providers ok');
}
