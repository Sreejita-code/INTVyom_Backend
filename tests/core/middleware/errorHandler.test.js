const test = require('node:test');
const assert = require('node:assert');
const errorHandler = require('../../../src/core/middleware/errorHandler');

const respond = (err) => {
  let captured;
  const res = {
    status: (status) => ({
      json: (body) => { captured = { status, body }; },
    }),
  };
  errorHandler(err, { method: 'GET', originalUrl: '/x' }, res, () => {});
  return captured;
};

test('error with status keeps it and returns { error }', () => {
  const err = new Error('Trunk not found');
  err.status = 404;
  const out = respond(err);
  assert.strictEqual(out.status, 404);
  assert.deepStrictEqual(out.body, { error: 'Trunk not found' });
});

test('error without status is a 500', () => {
  const out = respond(new Error('boom'));
  assert.strictEqual(out.status, 500);
  assert.deepStrictEqual(out.body, { error: 'boom' });
});

test('error with payload returns the payload verbatim (analytics passthrough)', () => {
  const err = new Error('Upstream said no');
  err.status = 502;
  err.payload = { error: 'Failed to contact external analytics service' };
  const out = respond(err);
  assert.strictEqual(out.status, 502);
  assert.deepStrictEqual(out.body, { error: 'Failed to contact external analytics service' });
});
