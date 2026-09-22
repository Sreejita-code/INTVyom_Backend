const test = require('node:test');
const assert = require('node:assert');
const proxyquire = require('proxyquire').noCallThru();

const USER = { _id: 'user-1', api_key: 'good-key' };
const lookups = [];

const requireAuth = proxyquire('../../../src/core/middleware/requireAuth', {
  '../db/schemas/user.model': {
    findOne: async (query) => {
      lookups.push(query.api_key);
      return query.api_key === USER.api_key ? USER : null;
    },
  },
});

const run = async (authorization) => {
  const req = { get: (name) => (name === 'authorization' ? authorization : undefined) };
  let passed;
  await requireAuth(req, {}, (err) => { passed = err; });
  return { req, err: passed };
};

test('a valid Bearer key sets req.user and calls next() without an error', async () => {
  const { req, err } = await run('Bearer good-key');
  assert.strictEqual(err, undefined);
  assert.strictEqual(req.user, USER);
});

test('the scheme is case-insensitive and extra whitespace is tolerated', async () => {
  for (const header of ['bearer good-key', 'Bearer  good-key', '  Bearer\tgood-key  ']) {
    const { req, err } = await run(header);
    assert.strictEqual(err, undefined, header);
    assert.strictEqual(req.user, USER, header);
  }
});

test('a missing header, a wrong scheme or trailing junk is a 401 before any lookup', async () => {
  lookups.length = 0;
  for (const header of [undefined, '', 'Bearer', 'Basic good-key', 'good-key', 'Bearer good-key junk']) {
    const { req, err } = await run(header);
    assert.strictEqual(err.status, 401, String(header));
    assert.match(err.message, /Bearer API key is required/);
    assert.strictEqual(req.user, undefined);
  }
  assert.deepStrictEqual(lookups, []);
});

test('an unknown key is a 401 and the token is not echoed', async () => {
  const { req, err } = await run('Bearer wrong-key');
  assert.strictEqual(err.status, 401);
  assert.doesNotMatch(err.message, /wrong-key/);
  assert.strictEqual(req.user, undefined);
});
