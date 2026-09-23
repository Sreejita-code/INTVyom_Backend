const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const request = require('supertest');
const proxyquire = require('proxyquire').noCallThru();

const STORED_KEY = 'sk-live-abcdef1234';

const router = proxyquire('../../../src/api/routes/integration.routes', {
  '../../integration/integration.service': {
    getApiKey: async () => ({ service_type: 'LLM', service_name: 'openai', api_key: STORED_KEY }),
  },
});

const app = express();
app.use((req, res, next) => {
  req.user = { _id: 'user1' };
  next();
});
app.use('/api/integration', router);

test('GET /get returns a masked preview and never the plaintext provider key', async () => {
  const res = await request(app).get('/api/integration/get?service_name=openai');

  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body.data, {
    service_type: 'LLM',
    service_name: 'openai',
    api_key_preview: '***1234',
  });
  assert.strictEqual(JSON.stringify(res.body).includes(STORED_KEY), false);
});
