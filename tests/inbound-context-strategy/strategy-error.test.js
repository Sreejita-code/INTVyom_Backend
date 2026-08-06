const test = require('node:test');
const assert = require('node:assert');
const { strategyError } = require('../../src/inbound-context-strategy/inbound-context-strategy.service');

test('strategyError: flattens FastAPI detail arrays into field: message', () => {
  const message = strategyError({
    detail: [
      { loc: ['body', 'strategy_config', 'url'], msg: "Value error, url host '169.254.169.254' resolves to a non-public address" },
    ],
  });
  assert.strictEqual(
    message,
    "strategy_config.url: Value error, url host '169.254.169.254' resolves to a non-public address"
  );
});

test('strategyError: joins multiple detail entries', () => {
  const message = strategyError({
    detail: [
      { loc: ['body', 'strategy_config', 'timeout_seconds'], msg: 'Input should be less than or equal to 10' },
      { loc: ['body', 'strategy_name'], msg: 'Field required' },
    ],
  });
  assert.strictEqual(
    message,
    'strategy_config.timeout_seconds: Input should be less than or equal to 10; strategy_name: Field required'
  );
});

test('strategyError: prefers the endpoint own error/message keys', () => {
  assert.strictEqual(strategyError({ error: 'Strategy not found' }), 'Strategy not found');
  assert.strictEqual(strategyError({ message: 'Nope' }), 'Nope');
});

test('strategyError: handles a string detail and an empty body', () => {
  assert.strictEqual(strategyError({ detail: 'Not authenticated' }), 'Not authenticated');
  assert.strictEqual(strategyError(null), 'External API Error');
});
