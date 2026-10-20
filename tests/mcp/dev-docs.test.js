const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadDevDocs, listDevDocs, getDevDoc, getChangelog } = require('../../src/mcp/dev-docs');

const makeDir = (t, files) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-docs-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [file, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, file), text);
  return dir;
};

test('loadDevDocs keys *.md files by name and takes the title from the first heading', (t) => {
  const docs = loadDevDocs(makeDir(t, { 'A.md': '# Alpha\nbody', 'B.md': 'no heading', 'skip.txt': 'x' }));
  assert.deepStrictEqual(listDevDocs(docs), [
    { name: 'A', title: 'Alpha' },
    { name: 'B', title: 'B' }
  ]);
});

test('getDevDoc returns the text, and null for an unknown or path-like name', (t) => {
  const docs = loadDevDocs(makeDir(t, { 'A.md': '# Alpha\nbody' }));
  assert.strictEqual(getDevDoc(docs, 'A').text, '# Alpha\nbody');
  assert.strictEqual(getDevDoc(docs, '../../package'), null);
  assert.strictEqual(getDevDoc(docs, 'A.md'), null);
});

test('a missing docs folder gives an empty set, not a crash', () => {
  const docs = loadDevDocs(path.join(os.tmpdir(), 'dev-docs-does-not-exist'));
  assert.strictEqual(docs.size, 0);
  assert.strictEqual(getChangelog(docs), null);
});

test('getChangelog returns the first N entries, skipping the preamble', (t) => {
  const docs = loadDevDocs(makeDir(t, {
    'CHANGELOG.md': '# Changelog\nintro\n\n## 3\nthree\n\n## 2\ntwo\n\n## 1\none\n'
  }));
  assert.deepStrictEqual(getChangelog(docs, 2), ['## 3\nthree', '## 2\ntwo']);
  assert.strictEqual(getChangelog(docs).length, 3);
});
