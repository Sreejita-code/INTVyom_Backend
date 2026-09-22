const test = require('node:test');
const assert = require('node:assert');

// sip.service.js destructures its dependencies at load time, so every stub has to land in
// the require cache BEFORE it is required.
const stubModule = (request, exports) => {
  const filename = require.resolve(request);
  require.cache[filename] = { id: filename, filename, loaded: true, exports, children: [], paths: [] };
};

// trunk_config holds the Twilio username/password: neither read path may return it.
const TRUNK = { _id: 't1', trunk_name: 'Main', trunk_config: { username: 'u', password: 'secret' } };
let projection = null;
let storedTrunk = null;

stubModule('../../src/services/livekit/livekitService', { EXTERNAL_BASE: 'https://stub', callExternal: async () => ({}) });
stubModule('../../src/auth/userAccess', async () => ({ _id: 'u1', api_key: 'user-key' }));
stubModule('../../src/core/db/schemas/user.model', { findById: async () => ({ _id: 'u1' }) });
stubModule('../../src/core/db/schemas/sip.model', {
  find: () => ({
    sort: () => ({
      select: async (fields) => {
        projection = fields;
        return [];
      },
    }),
  }),
});
stubModule('../../src/core/db/functions/findByLocalOrExternalId', async () => storedTrunk);

const { listSipTrunks, getSipTrunkDetails } = require('../../src/sip/sip.service');

test('the trunk list projects trunk_config out at the query', async () => {
  await listSipTrunks('u1');
  assert.strictEqual(projection, '-trunk_config');
});

test('trunk details drop trunk_config from a mongoose document and from a plain object', async () => {
  for (const trunk of [{ ...TRUNK, toObject() { return { ...TRUNK }; } }, { ...TRUNK }]) {
    storedTrunk = trunk;
    const { data } = await getSipTrunkDetails('u1', 't1');
    assert.strictEqual('trunk_config' in data, false);
    assert.strictEqual(data.trunk_name, 'Main');
  }
  // The stored record itself is untouched.
  assert.ok(storedTrunk.trunk_config);
});
