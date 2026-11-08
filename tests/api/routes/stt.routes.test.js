const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const request = require('supertest');
const proxyquire = require('proxyquire').noCallThru();

let lastTranscribe;

const sttRoutes = proxyquire('../../../src/api/routes/stt.routes', {
  '../../stt/stt.service': {
    transcribe: async (userId, payload) => {
      lastTranscribe = { userId, payload };
      return { success: true, data: { text: 'hello', provider: 'sarvam', usage: { pricing_complete: true } } };
    },
  },
});

const app = express();
app.use((req, res, next) => {
  req.user = { _id: 'user1' };
  next();
});
app.use('/api/stt', sttRoutes);
app.use(require('../../../src/core/middleware/errorHandler'));

test('POST /api/stt/transcribe requires a file', async () => {
  const res = await request(app).post('/api/stt/transcribe').field('provider', 'sarvam').expect(400);
  assert.match(res.body.error, /file is required/);
});

test('POST /api/stt/transcribe rejects unsupported provider', async () => {
  const res = await request(app)
    .post('/api/stt/transcribe')
    .field('provider', 'nope')
    .attach('file', Buffer.from('RIFF'), { filename: 'a.wav', contentType: 'audio/wav' })
    .expect(422);
  assert.match(res.body.error, /provider must be one of/);
});

test('POST /api/stt/transcribe forwards multipart fields and provider key', async () => {
  lastTranscribe = null;
  const res = await request(app)
    .post('/api/stt/transcribe')
    .set('X-Provider-API-Key', 'pk-stt')
    .field('provider', 'deepgram')
    .field('model', 'nova-3')
    .field('assistant_id', 'asst_1')
    .attach('file', Buffer.from('RIFFDATA'), { filename: 'sample.wav', contentType: 'audio/wav' })
    .expect(200);

  assert.strictEqual(res.body.success, true);
  assert.strictEqual(lastTranscribe.userId, 'user1');
  assert.strictEqual(lastTranscribe.payload.fields.provider, 'deepgram');
  assert.strictEqual(lastTranscribe.payload.fields.assistant_id, 'asst_1');
  assert.strictEqual(lastTranscribe.payload.providerApiKey, 'pk-stt');
  assert.strictEqual(lastTranscribe.payload.file.originalname, 'sample.wav');
});
