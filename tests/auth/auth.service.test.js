const test = require('node:test');
const assert = require('node:assert');

// auth.service.js destructures its dependencies at load time, so every stub has to land in the
// require cache BEFORE it is required.
const stubModule = (request, exports) => {
  const filename = require.resolve(request);
  require.cache[filename] = { id: filename, filename, loaded: true, exports, children: [], paths: [] };
};

const state = { existing: [], issued: 0, saveError: null };

stubModule('../../src/services/livekit/livekitService', {
  EXTERNAL_BASE: 'https://stub',
  callExternal: async () => {
    state.issued += 1;
    return { api_key: 'new-key' };
  },
});

function FakeUser(doc) { Object.assign(this, doc); }
FakeUser.findOne = async (filter) =>
  state.existing.find((u) => Object.entries(filter).every(([k, v]) => u[k] === v)) || null;
FakeUser.prototype.save = async function save() {
  if (state.saveError) throw state.saveError;
  return this;
};
stubModule('../../src/core/db/schemas/user.model', FakeUser);

const { registerUser } = require('../../src/auth/auth.service');

const SIGNUP = { user_name: 'john', org_name: 'Acme', user_email: 'john@acme.com', password: 'pw' };

test.beforeEach(() => {
  state.existing = [];
  state.issued = 0;
  state.saveError = null;
});

test('a taken user_name is rejected before an upstream key is issued', async () => {
  state.existing = [{ user_name: 'john', user_email: 'other@acme.com' }];

  await assert.rejects(() => registerUser(SIGNUP), /User name is already taken/);
  assert.strictEqual(state.issued, 0);
});

test('a free user_name signs up and gets the issued key', async () => {
  const user = await registerUser(SIGNUP);
  assert.strictEqual(user.api_key, 'new-key');
  assert.notStrictEqual(user.password, 'pw');
});

test('a concurrent-signup duplicate from the unique index maps to a readable message', async () => {
  state.saveError = Object.assign(new Error('E11000 duplicate key'), { code: 11000, keyPattern: { user_name: 1 } });
  await assert.rejects(() => registerUser(SIGNUP), /User name is already taken/);

  state.saveError = Object.assign(new Error('E11000 duplicate key'), { code: 11000, keyPattern: { user_email: 1 } });
  await assert.rejects(() => registerUser(SIGNUP), /email already exists/);
});
