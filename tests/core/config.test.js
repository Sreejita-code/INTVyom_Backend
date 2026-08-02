const test = require('node:test');
const assert = require('node:assert');

test('Settings reads PORT, MONGO_URI and defaults EXTERNAL_API_BASE', () => {
  process.env.PORT = '4321';
  delete process.env.EXTERNAL_API_BASE;
  // dotenv does not override values already set, so forcing PORT above is safe.
  delete require.cache[require.resolve('../../src/core/config')];
  const Settings = require('../../src/core/config');

  assert.strictEqual(Settings.port, 4321);
  assert.strictEqual(Settings.mongoUri, process.env.MONGO_URI);
  assert.strictEqual(
    Settings.externalApiBase,
    'https://api-livekit-vyom.indusnettechnologies.com'
  );

  delete process.env.PORT;
});
