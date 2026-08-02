const test = require('node:test');
const assert = require('node:assert');
const findByLocalOrExternalId = require('../../../../src/core/db/functions/findByLocalOrExternalId');

const capture = () => {
  const calls = [];
  const model = { findOne: (query) => { calls.push(query); return 'result'; } };
  return { model, calls };
};

test('a 24-hex id matches the local _id field', () => {
  const { model, calls } = capture();
  const result = findByLocalOrExternalId(model, '507f1f77bcf86cd799439011', 'u1', 'external_trunk_id');
  assert.strictEqual(result, 'result');
  assert.deepStrictEqual(calls[0], {
    $or: [
      { _id: '507f1f77bcf86cd799439011' },
      { external_trunk_id: '507f1f77bcf86cd799439011' },
    ],
    user_id: 'u1',
  });
});

test('a non-hex id only matches the external field', () => {
  const { model, calls } = capture();
  findByLocalOrExternalId(model, 'ext-trunk-abc', 'u1', 'external_trunk_id');
  assert.deepStrictEqual(calls[0].$or[0], { _id: null });
  assert.strictEqual(calls[0].$or[1].external_trunk_id, 'ext-trunk-abc');
});

test('extra filters are merged into the query', () => {
  const { model, calls } = capture();
  findByLocalOrExternalId(model, 'ext', 'u1', 'ext_id', { passthrough_mode: true });
  assert.strictEqual(calls[0].passthrough_mode, true);
});
