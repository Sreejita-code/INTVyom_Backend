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

// These responses changed shape in the frontend contract audit. Clients copy the example, so a
// synthesized one ("string" placeholders) is not good enough — each must carry an authored one,
// and the trunk examples must show the allow-listed config without credentials.
test('audited responses carry authored examples', () => {
  const AUDITED = [
    ['/api/assistant/list', 'get', '200'],
    ['/api/assistant/details/{id}', 'get', '200'],
    ['/api/sip/create-outbound-trunk', 'post', '201'],
    ['/api/sip/list', 'get', '200'],
    ['/api/sip/details/{id}', 'get', '200'],
    ['/api/integration/get', 'get', '200'],
    ['/api/integration/resync-status', 'get', '200'],
    ['/api/web-call/get-token', 'post', '200'],
    ['/api/assistant/call-logs/{id}', 'get', '200'],
    ['/api/assistant/create', 'post', '400'],
    ['/api/assistant/update/{id}', 'patch', '400'],
  ];
  for (const [p, method, code] of AUDITED) {
    const examples = doc.paths[p][method].responses[code].content['application/json'].examples;
    assert.ok(examples && Object.keys(examples).length > 0, `${method} ${p} ${code} has no authored example`);
    const text = JSON.stringify(examples);
    assert.ok(!text.includes('"password"') && !text.includes('"username"'), `${p} example leaks credentials`);
    assert.ok(!text.includes('"api_key":"sk-'), `${p} example shows a plaintext key`);
  }
});

// getSuggestedAlternatives returns an object keyed by slot ({ llm, llm_notes, ... }). The docs
// once said string[], which sent clients looking for an array that never arrives.
test('validation suggestions are documented as an object, not an array', () => {
  const schema = resolveRefs(doc.components.schemas.Error, doc).properties.suggestions;
  assert.strictEqual(schema.type, 'object');
  assert.ok(schema.properties.llm && schema.properties.llm_notes);
});

test('no doc text points at the non-existent POST /api/integration/ route', () => {
  assert.ok(!fs.readFileSync(path.join(root, 'swagger.yaml'), 'utf8').includes('`POST /api/integration/`'));
});
