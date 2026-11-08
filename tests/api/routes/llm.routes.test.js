const test = require('node:test');
const assert = require('node:assert');
const { Readable } = require('stream');
const express = require('express');
const request = require('supertest');
const proxyquire = require('proxyquire').noCallThru();

let lastChat;
let lastChatStream;

const llmRoutes = proxyquire('../../../src/api/routes/llm.routes', {
  '../../llm/llm.service': {
    chat: async (userId, body, opts) => {
      lastChat = { userId, body, opts };
      return { success: true, data: { message: { role: 'assistant', content: 'hi' }, usage: { total_tokens: 4 } } };
    },
    chatStream: async (userId, body, opts) => {
      lastChatStream = { userId, body, opts };
      return {
        status: 200,
        headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
        data: Readable.from('data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\n'),
      };
    },
  },
});

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = { _id: 'user1' };
  next();
});
app.use('/api/llm', llmRoutes);
app.use(require('../../../src/core/middleware/errorHandler'));

test('POST /api/llm/chat validates messages', async () => {
  const res = await request(app).post('/api/llm/chat').send({ messages: [] }).expect(400);
  assert.match(res.body.error, /messages/);
});

test('POST /api/llm/chat returns JSON for non-streaming requests', async () => {
  lastChat = null;
  const res = await request(app)
    .post('/api/llm/chat')
    .set('X-Provider-API-Key', 'pk-llm')
    .send({ messages: [{ role: 'user', content: 'hello' }], provider: 'openai', temperature: 0.2 })
    .expect(200);

  assert.strictEqual(res.body.success, true);
  assert.strictEqual(lastChat.opts.providerApiKey, 'pk-llm');
  assert.strictEqual(lastChat.body.stream, undefined);
});

test('POST /api/llm/chat streams SSE when stream=true', async () => {
  lastChatStream = null;
  const res = await request(app)
    .post('/api/llm/chat')
    .send({ messages: [{ role: 'user', content: 'hello' }], stream: true })
    .buffer(true)
    .parse((res, cb) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => cb(null, data));
    })
    .expect(200);

  assert.match(String(res.headers['content-type']), /text\/event-stream/);
  assert.match(res.body, /data: \[DONE\]/);
  assert.strictEqual(lastChatStream.body.stream, true);
});
