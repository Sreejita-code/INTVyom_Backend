const test = require('node:test');
const assert = require('node:assert');

// sip.service.js destructures its dependencies at load time, so every stub has to land in
// the require cache BEFORE it is required.
const stubModule = (request, exports) => {
  const filename = require.resolve(request);
  require.cache[filename] = { id: filename, filename, loaded: true, exports, children: [], paths: [] };
};

// Contract change (was: trunk_config projected out entirely). The frontend needs the
// trunk's address and phone numbers, so every read path now returns an allow-listed
// trunk_config. The credentials (username/password) and any unknown key must never leak.
const TWILIO_CONFIG = {
  address: 'example.pstn.twilio.com',
  numbers: ['+15550100000'],
  username: 'AC123',
  password: 'secret',
  some_future_key: 'x',
};
const TRUNK = { _id: 't1', trunk_name: 'Main', trunk_type: 'twilio', trunk_config: TWILIO_CONFIG };
const EXOTEL_TRUNK = {
  _id: 't2',
  trunk_name: 'Exotel',
  trunk_type: 'exotel',
  trunk_config: { exotel_number: '+918044319240', sip_host: 'sip.exotel.com', sip_port: 5070, sip_domain: 'exo' },
};

const asDoc = (plain) => ({ ...plain, toObject() { return JSON.parse(JSON.stringify(plain)); } });

let listed = [];
let storedTrunk = null;

stubModule('../../src/services/livekit/livekitService', {
  EXTERNAL_BASE: 'https://stub',
  callExternal: async () => ({ data: { trunk_id: 'ST_new' } }),
});
stubModule('../../src/auth/userAccess', async () => ({ _id: 'u1', api_key: 'user-key' }));
stubModule('../../src/core/db/schemas/user.model', { findById: async () => ({ _id: 'u1' }) });

function FakeSipTrunk(doc) { Object.assign(this, doc); }
FakeSipTrunk.prototype.save = async function save() {
  const plain = { ...this };
  return asDoc(plain);
};
FakeSipTrunk.find = () => ({ sort: () => listed });
stubModule('../../src/core/db/schemas/sip.model', FakeSipTrunk);
stubModule('../../src/core/db/functions/findByLocalOrExternalId', async () => storedTrunk);

const { listSipTrunks, getSipTrunkDetails, createOutboundTrunk } = require('../../src/sip/sip.service');

const assertNoSecrets = (config) => {
  assert.strictEqual('username' in config, false);
  assert.strictEqual('password' in config, false);
  assert.strictEqual('some_future_key' in config, false);
};

test('the trunk list returns the non-secret trunk_config fields only', async () => {
  listed = [asDoc(TRUNK), asDoc(EXOTEL_TRUNK)];
  const { data } = await listSipTrunks('u1');

  assert.deepStrictEqual(data[0].trunk_config, { address: 'example.pstn.twilio.com', numbers: ['+15550100000'] });
  assertNoSecrets(data[0].trunk_config);
  assert.deepStrictEqual(data[1].trunk_config, EXOTEL_TRUNK.trunk_config);
});

test('trunk details return the allow-listed trunk_config from a document and a plain object', async () => {
  for (const trunk of [asDoc(TRUNK), { ...TRUNK }]) {
    storedTrunk = trunk;
    const { data } = await getSipTrunkDetails('u1', 't1');
    assert.strictEqual(data.trunk_name, 'Main');
    assert.deepStrictEqual(data.trunk_config.numbers, ['+15550100000']);
    assertNoSecrets(data.trunk_config);
  }
  // The stored record itself is untouched.
  assert.strictEqual(storedTrunk.trunk_config.password, 'secret');
});

test('the create response never echoes the SIP credentials', async () => {
  const trunk = await createOutboundTrunk({
    user_id: 'u1',
    trunk_name: 'Main',
    trunk_type: 'Twilio',
    trunk_config: TWILIO_CONFIG,
  });

  assert.strictEqual(trunk.external_trunk_id, 'ST_new');
  assert.strictEqual(trunk.trunk_config.address, 'example.pstn.twilio.com');
  assertNoSecrets(trunk.trunk_config);
});
