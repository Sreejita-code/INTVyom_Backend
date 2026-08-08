const test = require('node:test');
const assert = require('node:assert');

// sip.service.js destructures its dependencies at load time, so every stub has to land in
// the require cache BEFORE it is required.
const stubModule = (request, exports) => {
  const filename = require.resolve(request);
  require.cache[filename] = { id: filename, filename, loaded: true, exports, children: [], paths: [] };
};

const sent = { external: null, deletedId: null };
let externalError = null;
let storedTrunk = null;

stubModule('../../src/services/livekit/livekitService', {
  EXTERNAL_BASE: 'https://stub',
  callExternal: async (apiKey, opts) => {
    sent.external = { apiKey, ...opts };
    if (externalError) throw externalError;
    return { success: true };
  },
});

stubModule('../../src/auth/userAccess', async () => ({ _id: 'u1', api_key: 'user-key' }));
stubModule('../../src/core/db/schemas/user.model', { findById: async () => ({ _id: 'u1' }) });

stubModule('../../src/core/db/schemas/sip.model', {
  findOne: async () => storedTrunk,
  findById: async () => storedTrunk,
  findByIdAndDelete: async (id) => {
    sent.deletedId = id;
    return storedTrunk;
  },
});

stubModule('../../src/core/db/functions/findByLocalOrExternalId', async () => storedTrunk);

const { deleteSipTrunk } = require('../../src/sip/sip.service');

const upstreamError = (status) => Object.assign(new Error(`upstream ${status}`), { status });

test.beforeEach(() => {
  sent.external = null;
  sent.deletedId = null;
  externalError = null;
  storedTrunk = { _id: 'local-1', external_trunk_id: 'ST_abc' };
});

test('delete deactivates upstream before dropping the local row', async () => {
  const result = await deleteSipTrunk('u1', 'ST_abc');

  assert.strictEqual(sent.external.method, 'delete');
  assert.strictEqual(sent.external.path, '/sip/deactivate/ST_abc');
  assert.strictEqual(sent.deletedId, 'local-1');
  assert.strictEqual(result.external_deactivated, true);
  assert.strictEqual(result.local_data_removed, true);
});

test('an already-inactive or already-gone upstream trunk still clears the local row', async () => {
  // Otherwise a half-finished delete strands the local mirror with nothing to delete it.
  for (const status of [400, 404]) {
    sent.deletedId = null;
    externalError = upstreamError(status);

    const result = await deleteSipTrunk('u1', 'ST_abc');
    assert.strictEqual(result.external_deactivated, false, `status ${status}`);
    assert.strictEqual(sent.deletedId, 'local-1', `status ${status}`);
  }
});

test('any other upstream failure aborts before the local delete', async () => {
  // The trunk is still live and billable upstream, so the local record must survive as the
  // only way to find it again.
  externalError = upstreamError(500);

  await assert.rejects(() => deleteSipTrunk('u1', 'ST_abc'), /upstream 500/);
  assert.strictEqual(sent.deletedId, null);
});

test('a trunk missing locally is a 404, and nothing is sent upstream', async () => {
  storedTrunk = null;

  await assert.rejects(
    () => deleteSipTrunk('u1', 'ST_nope'),
    (error) => error.status === 404 && /not found/.test(error.message)
  );
  assert.strictEqual(sent.external, null);
});
