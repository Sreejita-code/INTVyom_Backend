const test = require('node:test');
const assert = require('node:assert');
const { Readable } = require('stream');
const express = require('express');
const request = require('supertest');
const proxyquire = require('proxyquire').noCallThru();

let lastSynthesize;
let lastStream;

const ttsRoutes = proxyquire('../../../src/api/routes/tts.routes', {
  '../../tts/tts.service': {
    synthesize: async (userId, body, opts) => {
      lastSynthesize = { userId, body, opts };
      return { success: true, message: 'Speech synthesized successfully', data: { audio_base64: 'QUJD', media_type: 'audio/wav' } };
    },
    synthesizeStream: async (userId, body, opts) => {
      lastStream = { userId, body, opts };
      return {
        status: 200,
        headers: {
          'content-type': 'audio/wav',
          'content-disposition': 'inline; filename="speech.wav"',
          'content-length': '4',
          'x-tts-characters': '5',
          'x-audio-duration': '1.5',
          'x-estimated-cost-usd': '0.000100',
          'x-pricing-complete': 'true',
          'x-provider': 'cartesia',
          'x-model': 'sonic-3',
        },
        data: Readable.from(Buffer.from('RIFF')),
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
app.use('/api/tts', ttsRoutes);
app.use(require('../../../src/core/middleware/errorHandler'));

test('POST /api/tts/synthesize validates text', async () => {
  const res = await request(app).post('/api/tts/synthesize').send({}).expect(400);
  assert.match(res.body.error, /text/);
});

test('POST /api/tts/synthesize returns JSON when response_format=json and forwards provider key', async () => {
  lastSynthesize = null;
  const res = await request(app)
    .post('/api/tts/synthesize')
    .set('X-Provider-API-Key', 'pk-test')
    .send({ text: 'hello', response_format: 'json', save_to_library: true })
    .expect(200);

  assert.strictEqual(res.body.success, true);
  assert.strictEqual(lastSynthesize.userId, 'user1');
  assert.strictEqual(lastSynthesize.body.text, 'hello');
  assert.strictEqual(lastSynthesize.body.save_to_library, true);
  assert.strictEqual(lastSynthesize.opts.providerApiKey, 'pk-test');
});

test('POST /api/tts/synthesize streams audio by default and preserves TTS headers', async () => {
  lastStream = null;
  const res = await request(app)
    .post('/api/tts/synthesize')
    .send({ text: 'hello' })
    .expect(200);

  assert.match(res.headers['content-type'], /audio\/wav/);
  assert.strictEqual(res.headers['x-tts-characters'], '5');
  assert.strictEqual(res.headers['x-provider'], 'cartesia');
  assert.strictEqual(res.headers['x-model'], 'sonic-3');
  const body = Buffer.isBuffer(res.body) && res.body.length ? res.body.toString() : res.text;
  assert.strictEqual(body, 'RIFF');
  assert.strictEqual(lastStream.body.response_format, 'audio');
});
