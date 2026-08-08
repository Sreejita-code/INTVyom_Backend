/**
 * Run an async mapper over a list with a ceiling on how many run at once.
 *
 * Exists because the billable-minutes aggregators fan out across every assistant and every page of
 * its call logs. Done serially that is hundreds of sequential upstream requests; done with an
 * unbounded `Promise.all` it is a burst large enough to get rate-limited. A small fixed window is
 * the only shape that is both fast and polite.
 *
 * Results come back in input order regardless of completion order — the aggregators sum into
 * per-platform buckets, so a silent reordering would be invisible until the totals were wrong.
 *
 * @param {Array} items
 * @param {number} limit Maximum concurrent `mapper` calls. Values below 1 are treated as 1.
 * @param {(item: any, index: number) => Promise<any>} mapper
 * @returns {Promise<Array>} results, aligned to `items` by index
 */
const mapLimit = async (items, limit, mapper) => {
  const list = Array.from(items);
  const results = new Array(list.length);
  const width = Math.max(1, Math.min(Math.floor(limit) || 1, list.length));

  let next = 0;
  const worker = async () => {
    // `next++` is atomic here: JS runs this synchronously between awaits, so two workers can
    // never claim the same index.
    while (next < list.length) {
      const index = next++;
      results[index] = await mapper(list[index], index);
    }
  };

  await Promise.all(Array.from({ length: width }, worker));
  return results;
};

module.exports = mapLimit;
