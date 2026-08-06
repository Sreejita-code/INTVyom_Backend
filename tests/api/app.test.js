const test = require('node:test');
const assert = require('node:assert');
const createApp = require('../../src/server');

const startApp = () => new Promise((resolve, reject) => {
  const server = createApp().listen(0, '127.0.0.1', () => {
    resolve({
      server,
      base: `http://127.0.0.1:${server.address().port}`,
    });
  });
  server.on('error', reject);
});

const request = async (base, path, options = {}) => {
  const response = await fetch(`${base}${path}`, options);
  return { status: response.status, body: await response.json() };
};

test('wiring: routes are mounted and validation errors are shaped centrally', async (t) => {
  const { server, base } = await startApp();
  t.after(() => server.close());

  // Validation-only paths never reach the DB.
  const missingUserName = await request(base, '/api/auth/get_api');
  assert.strictEqual(missingUserName.status, 400);
  assert.deepStrictEqual(missingUserName.body, { error: 'user_name parameter is required' });

  const missingUserId = await request(base, '/api/assistant/list');
  assert.strictEqual(missingUserId.status, 400);
  assert.deepStrictEqual(missingUserId.body, { error: 'user_id query parameter is required' });

  const missingCallFields = await request(base, '/api/call/outbound', { method: 'POST' });
  assert.strictEqual(missingCallFields.status, 400);

  const missingAudioFile = await request(base, '/api/audio/upload', { method: 'POST' });
  assert.strictEqual(missingAudioFile.status, 400);

  const missingInboundFields = await request(base, '/api/inbound/assign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: 'u1' }),
  });
  assert.strictEqual(missingInboundFields.status, 400);

  // name may arrive as `name` or `strategy_name`; url is still mandatory.
  const missingStrategyUrl = await request(base, '/api/inbound-context-strategy/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: 'u1', strategy_name: 'CRM', strategy_config: {} }),
  });
  assert.strictEqual(missingStrategyUrl.status, 400);
});

test('wiring: unknown routes hit the 404 fallback with the same envelope', async (t) => {
  const { server, base } = await startApp();
  t.after(() => server.close());

  const response = await request(base, '/api/does-not-exist');
  assert.strictEqual(response.status, 404);
  assert.ok(response.body.error.includes('Route not found'));
});
