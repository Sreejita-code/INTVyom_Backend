const test = require('node:test');
const assert = require('node:assert');

// assistant.service.js destructures its dependencies at load time, so every stub has to
// land in the require cache BEFORE it is required.
const stubModule = (request, exports) => {
  const filename = require.resolve(request);
  require.cache[filename] = { id: filename, filename, loaded: true, exports, children: [], paths: [] };
};

const sent = { create: null, saved: null };

stubModule('../../src/services/livekit/livekitService', {
  EXTERNAL_BASE: 'https://stub',
  callExternal: async (apiKey, opts) => {
    sent.create = opts.data;
    return { data: { assistant_id: 'ext-new' } };
  },
});

stubModule('../../src/auth/userAccess', async () => ({ _id: 'u1', api_key: 'user-key' }));

function FakeAssistant(doc) { Object.assign(this, doc); }
FakeAssistant.prototype.save = async function save() { sent.saved = { ...this }; return this; };
stubModule('../../src/core/db/schemas/assistant.model', FakeAssistant);

const providers = require('../../src/integration/providers');
providers.resolveApiKey = async ({ kind, name }) => `${kind}-${name}-key`;

const { createAssistant } = require('../../src/assistant/assistant.service');

test('assistant_end_call_webhook reaches the upstream payload and the local mirror on create', async () => {
  const webhook = { timeout_seconds: 45, attempts: 5 };

  await createAssistant({
    user_id: 'u1',
    assistant_name: 'A',
    assistant_description: 'd',
    assistant_prompt: 'p',
    assistant_mode: 'realtime',
    assistant_end_call_webhook: webhook,
  });

  assert.deepStrictEqual(sent.create.assistant_end_call_webhook, webhook);
  assert.deepStrictEqual(sent.saved.end_call_webhook, webhook);
});

test('every documented create example in swagger.yaml passes local validation', async () => {
  // These are the payloads the /mcp docs server hands agents as copy-ready. If one stops passing
  // (a model is retired, a speaker leaves the roster), this fails before an agent ships it.
  const YAML = require('yamljs');
  const doc = YAML.load(require('node:path').join(__dirname, '..', '..', 'swagger.yaml'));
  const examples = doc.paths['/api/assistant/create'].post.requestBody.content['application/json'].examples;
  assert.ok(Object.keys(examples).length >= 3);

  for (const [name, { value }] of Object.entries(examples)) {
    sent.create = null;
    await assert.doesNotReject(() => createAssistant({ user_id: 'u1', ...value }), name);
    assert.strictEqual(sent.create.assistant_mode, value.assistant_mode, name);
  }
});
