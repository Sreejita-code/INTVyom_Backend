const test = require('node:test');
const assert = require('node:assert');

// assistant.service.js destructures its dependencies at load time, so every stub has to
// land in the require cache BEFORE it is required.
const stubModule = (request, exports) => {
  const filename = require.resolve(request);
  require.cache[filename] = { id: filename, filename, loaded: true, exports, children: [], paths: [] };
};

const WEBHOOK = { timeout_seconds: 45, attempts: 5 };
let mirrorRow = null;

stubModule('../../src/services/livekit/livekitService', {
  EXTERNAL_BASE: 'https://stub',
  callExternal: async () => ({ success: true, data: { assistant_id: 'ext-1', assistant_name: 'A' } }),
});
stubModule('../../src/auth/userAccess', async () => ({ _id: 'u1', api_key: 'user-key' }));
stubModule('../../src/core/db/functions/findByLocalOrExternalId', async () => mirrorRow);

const { getAssistantDetails, getCallLogs } = require('../../src/assistant/assistant.service');

test('call logs for an assistant the user does not own are a 404, not a 500', async () => {
  mirrorRow = null;
  await assert.rejects(getCallLogs('u1', 'missing', {}), (error) => {
    assert.strictEqual(error.status, 404);
    return true;
  });
});

test('details carry the locally mirrored assistant_end_call_webhook upstream omits', async () => {
  mirrorRow = { external_assistant_id: 'ext-1', end_call_webhook: WEBHOOK };
  const result = await getAssistantDetails('u1', 'ext-1');

  assert.deepStrictEqual(result.data.assistant_end_call_webhook, WEBHOOK);
  assert.strictEqual(result.data.assistant_name, 'A');
});

test('details without a mirror row (or without tuning) pass upstream through unchanged', async () => {
  for (const row of [null, { external_assistant_id: 'ext-1' }]) {
    mirrorRow = row;
    const result = await getAssistantDetails('u1', 'ext-1');
    assert.strictEqual('assistant_end_call_webhook' in result.data, false);
  }
});
