const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yamljs');
const { resolveRefs } = require('../../src/mcp/swagger-index');

// swagger.yaml is also what the /mcp docs server hands to agents, so drift here means agents are
// told about endpoints that do not exist, or never learn about ones that do.
const root = path.join(__dirname, '..', '..');
const doc = YAML.load(path.join(root, 'swagger.yaml'));
const HTTP = ['get', 'post', 'put', 'patch', 'delete'];

const normalize = (p) => (p.length > 1 ? p.replace(/\/$/, '') : p).replace(/:(\w+)/g, '{$1}');

// Read the mounts in server.js and each router's declarations. Static on purpose: Express 5 does
// not keep a mount path string on its layers, and every route here is declared with a literal.
const mountedRoutes = () => {
  const server = fs.readFileSync(path.join(root, 'src/server.js'), 'utf8');
  const files = {};
  for (const [, name, file] of server.matchAll(/const (\w+) = require\('(\.\/[^']+)'\)/g)) files[name] = file;

  const routes = new Set();
  for (const [, mount, call] of server.matchAll(/app\.use\('([^']+)',\s*(\w+)/g)) {
    const file = files[call];
    if (!file) continue;
    const source = fs.readFileSync(path.join(root, 'src', `${file}.js`), 'utf8');
    for (const [, method, sub] of source.matchAll(/router\.(get|post|put|patch|delete)\('([^']*)'/g)) {
      routes.add(`${method.toUpperCase()} ${normalize(mount + (sub === '/' ? '' : sub))}`);
    }
  }
  return routes;
};

const documentedRoutes = () => {
  const routes = new Set();
  for (const [p, item] of Object.entries(doc.paths)) {
    for (const method of Object.keys(item)) {
      if (HTTP.includes(method)) routes.add(`${method.toUpperCase()} ${normalize(p)}`);
    }
  }
  return routes;
};

test('every mounted route is documented in swagger.yaml, and nothing extra is', () => {
  const mounted = mountedRoutes();
  const documented = documentedRoutes();
  assert.ok(mounted.size > 50, 'route scan found too few routes — the parser is broken');

  const undocumented = [...mounted].filter((r) => !documented.has(r));
  const phantom = [...documented].filter((r) => !mounted.has(r));
  assert.deepStrictEqual(undocumented, [], 'routes missing from swagger.yaml');
  assert.deepStrictEqual(phantom, [], 'swagger.yaml documents routes that do not exist');
});

test('every $ref in every operation resolves', () => {
  const text = JSON.stringify(resolveRefs(doc.paths, doc));
  assert.ok(!text.includes('(unresolved)'), 'dangling $ref in swagger.yaml');
});

test('info.description stays an overview — details belong on the schemas', () => {
  assert.ok(doc.info.description.split('\n').length <= 40);
});
