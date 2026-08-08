const test = require('node:test');
const assert = require('node:assert');

const mapLimit = require('../../src/core/async/mapLimit');

const defer = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('never runs more than `limit` mappers at once', async () => {
  let inFlight = 0;
  let peak = 0;

  await mapLimit(Array.from({ length: 20 }, (_, i) => i), 4, async (item) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await defer(1);
    inFlight -= 1;
    return item;
  });

  assert.strictEqual(peak, 4, `expected at most 4 concurrent, saw ${peak}`);
});

test('returns results in input order even when they finish out of order', async () => {
  // Reverse the durations so the last item finishes first. The billable aggregators sum these
  // into per-platform buckets, so a silent reorder would surface as wrong totals, not an error.
  const items = [0, 1, 2, 3, 4];
  const results = await mapLimit(items, 3, async (item) => {
    await defer((items.length - item) * 2);
    return item * 10;
  });

  assert.deepStrictEqual(results, [0, 10, 20, 30, 40]);
});

test('runs everything even when there are more items than the limit', async () => {
  const seen = [];
  await mapLimit(Array.from({ length: 50 }, (_, i) => i), 5, async (item) => {
    seen.push(item);
  });

  assert.strictEqual(seen.length, 50);
  assert.strictEqual(new Set(seen).size, 50, 'every item ran exactly once');
});

test('handles an empty list without hanging', async () => {
  assert.deepStrictEqual(await mapLimit([], 5, async () => 'never'), []);
});

test('treats a limit below 1 as serial rather than deadlocking', async () => {
  let peak = 0;
  let inFlight = 0;

  const results = await mapLimit([1, 2, 3], 0, async (item) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await defer(1);
    inFlight -= 1;
    return item;
  });

  assert.deepStrictEqual(results, [1, 2, 3]);
  assert.strictEqual(peak, 1);
});

test('a rejecting mapper rejects the whole call', async () => {
  await assert.rejects(
    mapLimit([1, 2, 3], 2, async (item) => {
      if (item === 2) throw new Error('boom');
      return item;
    }),
    /boom/
  );
});
