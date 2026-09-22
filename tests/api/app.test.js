const test = require('node:test');
const assert = require('node:assert');

// Stub the User model and the assistant service BEFORE the app loads. requireAuth resolves the
// first, and the assistant routes resolve the second; everything else the app imports is real.
const stubModule = (request, exports) => {
  const filename = require.resolve(request);
  require.cache[filename] = { id: filename, filename, loaded: true, exports, children: [], paths: [] };
};

const USERS = [
  { _id: 'user-a', api_key: 'key-a', user_name: 'a' },
  { _id: 'user-b', api_key: 'key-b', user_name: 'b' },
  // A user whose upstream key issuance failed at signup — must never authenticate.
  { _id: 'user-null', api_key: null, user_name: 'null' },
];

const calls = { create: [], details: [] };

stubModule('../../src/core/db/schemas/user.model', {
  findOne: async (filter) => USERS.find((u) => u.api_key === filter.api_key) || null,
  findById: async (id) => USERS.find((u) => String(u._id) === String(id)) || null,
});

stubModule('../../src/assistant/assistant.service', {
  createAssistant: async (data) => {
    calls.create.push(data);
    return { _id: 'asst-1', user_id: data.user_id, name: data.assistant_name };
  },
  getAssistantDetails: async (userId) => {
    calls.details.push(userId);
    return { success: true, data: { assistant_id: 'ext-1' } };
  },
  listAssistants: async () => ({ success: true, data: [] }),
  updateAssistant: async () => ({ success: true }),
  deleteAssistant: async () => ({ success: true }),
  validateAssistant: async () => ({ success: true }),
  getCallLogs: async () => ({ success: true }),
  getTotalBillableDuration: async () => ({ success: true }),
  getPlatformWiseBillableMinutes: async () => ({ success: true }),
  resyncAssistantsForIntegration: async () => ({ success: true }),
});

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
  let body = null;
  try {
    body = await response.json();
  } catch (error) {
    body = null;
  }
  return { status: response.status, body };
};

const auth = (key) => ({ Authorization: `Bearer ${key}` });

// One representative path per mounted router. `authRoutes` is public (signup/login) so it is
// covered by the public-route test instead.
const PROTECTED_PATHS = [
  ['assistant', '/api/assistant/list'],
  ['sip', '/api/sip/list'],
  ['call', '/api/call/outbound'],
  ['integration', '/api/integration/get'],
  ['tool', '/api/tool/list'],
  ['web-call', '/api/web-call/get-token'],
  ['inbound', '/api/inbound/list'],
  ['inbound-context-strategy', '/api/inbound-context-strategy/list'],
  ['analytics', '/api/analytics/dashboard'],
  ['passthrough-call', '/api/passthrough-call/call-records'],
  ['audio', '/api/audio/list'],
  ['meeting-call', '/api/meeting-call/join'],
];

test('every protected router answers 401 without a bearer key', async (t) => {
  const { server, base } = await startApp();
  t.after(() => server.close());

  for (const [name, path] of PROTECTED_PATHS) {
    const response = await request(base, path);
    assert.strictEqual(response.status, 401, `${name} (${path}) should be 401`);
    assert.strictEqual(
      response.body.error,
      'Authorization header with a Bearer API key is required'
    );
  }
});

test('unknown and null keys are both 401 and never echo the key', async (t) => {
  const { server, base } = await startApp();
  t.after(() => server.close());

  for (const token of ['unknown-key', 'null', '', 'null-key-user']) {
    const response = await request(base, '/api/assistant/list', { headers: auth(token) });
    assert.strictEqual(response.status, 401, `token '${token}' should be 401`);
    // The message never echoes the token back to the caller.
    if (token) assert.ok(!response.body.error.includes(token));
  }

  // A user row whose api_key is null is not matched by any token value, so `Bearer null`
  // (the literal string) is refused like any other unknown key.
  const nullUserAttempt = await request(base, '/api/assistant/list', { headers: auth('null') });
  assert.strictEqual(nullUserAttempt.status, 401);
});

test('signup and login are public — they answer validation 400, not 401', async (t) => {
  const { server, base } = await startApp();
  t.after(() => server.close());

  const login = await request(base, '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.strictEqual(login.status, 400);

  const signup = await request(base, '/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.notStrictEqual(signup.status, 401);
});

test('a valid key runs the handler', async (t) => {
  const { server, base } = await startApp();
  t.after(() => server.close());

  const response = await request(base, '/api/assistant/templates', { headers: auth('key-a') });
  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.body.success, true);
  assert.ok(Array.isArray(response.body.data));
});

test('an authenticated request to an unknown /api path is a 404, not a 401', async (t) => {
  const { server, base } = await startApp();
  t.after(() => server.close());

  // Without a key the middleware answers first: an unauthenticated caller learns nothing
  // about which paths exist.
  const anonymous = await request(base, '/api/does-not-exist');
  assert.strictEqual(anonymous.status, 401);

  const authenticated = await request(base, '/api/does-not-exist', { headers: auth('key-a') });
  assert.strictEqual(authenticated.status, 404);
});

test('cross-tenant: a body user_id cannot override the bearer identity', async (t) => {
  const { server, base } = await startApp();
  t.after(() => server.close());

  calls.create.length = 0;
  calls.details.length = 0;

  // User A's key, but the payload claims to be user B. The route must use A.
  const created = await request(base, '/api/assistant/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth('key-a') },
    body: JSON.stringify({
      user_id: 'user-b',
      assistant_name: 'X',
      assistant_description: 'd',
      assistant_prompt: 'p',
    }),
  });
  assert.notStrictEqual(created.status, 200);
  assert.strictEqual(calls.create[0].user_id, 'user-a');
  assert.notStrictEqual(calls.create[0].user_id, 'user-b');

  // Same for a read: user A's key does not read as user B.
  await request(base, '/api/assistant/details/ext-1?user_id=user-b', { headers: auth('key-a') });
  assert.strictEqual(calls.details[0], 'user-a');
});

test('wiring: unknown routes hit the 404 fallback with the same envelope', async (t) => {
  const { server, base } = await startApp();
  t.after(() => server.close());

  const response = await request(base, '/api/does-not-exist', { headers: auth('key-a') });
  assert.strictEqual(response.status, 404);
  assert.ok(response.body.error.includes('Route not found'));
});
