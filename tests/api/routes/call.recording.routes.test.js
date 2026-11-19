const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const request = require('supertest');
const proxyquire = require('proxyquire').noCallThru();

let lastUrl;
let serviceError;
const AUDIO = Buffer.from('ID3AUDIO');

const callRoutes = proxyquire('../../../src/api/routes/call.routes', {
  '../../call/call.service': {
    makeOutboundCall: async () => ({}),
    getQueueStatus: async () => ({}),
  },
  '../../services/exotel/exotelRecordingService': {
    isAllowedExotelRecordingUrl: (url) => String(url).startsWith('https://recordings.mum1.exotel.com/'),
    downloadExotelRecording: async (url) => {
      lastUrl = url;
      if (serviceError) throw serviceError;
      return { audio: AUDIO, mimeType: 'audio/mpeg', filename: 'call.mp3' };
    },
  },
});

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = { _id: 'user1' };
  next();
});
app.use('/api/call', callRoutes);
app.use(require('../../../src/core/middleware/errorHandler'));

const binaryParser = (res, callback) => {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
};

const RECORDING_URL = 'https://recordings.mum1.exotel.com/exotelrecordings/lokaviveka1m/call.mp3';

test('POST /api/call/recording requires a recording_url', async () => {
  const res = await request(app).post('/api/call/recording').send({}).expect(400);
  assert.match(res.body.error, /recording_url is required/);
});

test('POST /api/call/recording refuses a disallowed URL before any download', async () => {
  lastUrl = null;
  const res = await request(app)
    .post('/api/call/recording')
    .send({ recording_url: 'https://evil.test/call.mp3' })
    .expect(400);

  assert.match(res.body.error, /HTTPS Exotel recording URL/);
  assert.strictEqual(lastUrl, null);
});

test('POST /api/call/recording returns the audio bytes with download headers', async () => {
  const res = await request(app)
    .post('/api/call/recording')
    .send({ recording_url: RECORDING_URL })
    .buffer(true)
    .parse(binaryParser)
    .expect(200);

  assert.strictEqual(lastUrl, RECORDING_URL);
  assert.strictEqual(res.headers['content-type'], 'audio/mpeg');
  assert.strictEqual(res.headers['content-disposition'], 'attachment; filename="call.mp3"');
  assert.strictEqual(res.headers['cache-control'], 'no-store');
  assert.deepStrictEqual(res.body, AUDIO);
});

test('POST /api/call/recording keeps the service status and message', async () => {
  serviceError = Object.assign(new Error('The recording provider returned HTTP 403.'), { status: 502 });
  try {
    const res = await request(app)
      .post('/api/call/recording')
      .send({ recording_url: RECORDING_URL })
      .expect(502);
    assert.match(res.body.error, /HTTP 403/);
  } finally {
    serviceError = null;
  }
});
