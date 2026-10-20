const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');

// docs/ARCHITECTURE.md is served to agents as the map of src/. A folder the map never mentions is
// a folder an agent will not find.
test('docs/ARCHITECTURE.md names every folder under src/', () => {
  const architecture = fs.readFileSync(path.join(root, 'docs', 'ARCHITECTURE.md'), 'utf8');
  const folders = fs.readdirSync(path.join(root, 'src'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  // `src/` folders appear in the tree as `├── name/` and in the layer prose as `src/name/`.
  const mentioned = (folder) => new RegExp(`(^[\\s│├└─]*|src/)${folder}/`, 'm').test(architecture);
  const missing = folders.filter((folder) => !mentioned(folder));
  assert.deepStrictEqual(missing, []);
});
