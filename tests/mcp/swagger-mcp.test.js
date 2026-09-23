const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const YAML = require('yamljs');

const createApp = require('../../src/server');
const {
  resolveRefs,
  exampleFromSchema,
  listEndpoints,
  findEndpoint,
  searchEndpoints
} = require('../../src/mcp/swagger-index');

const doc = YAML.load(path.join(__dirname, '..', '..', 'swagger.yaml'));

const startApp = () => new Promise((resolve, reject) => {
  const server = createApp().listen(0, '127.0.0.1', () => {
    resolve({ server, base: `http://127.0.0.1:${server.address().port}` });
  });
  server.on('error', reject);
});

// The transport may answer with a bare JSON body or SSE framing; accept both.
const parseMcpBody = (text) => {
  const trimmed = text.trim();
  if (trimmed.startsWith('event:')) {
    const dataLine = trimmed.split('\n').find((line) => line.startsWith('data: '));
    return JSON.parse(dataLine.slice('data: '.length));
  }
  return JSON.parse(trimmed);
};

const mcpPost = async (base, body) => {
  const response = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream'
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  return { status: response.status, text, json: text ? parseMcpBody(text) : null };
};

// --- Pure helpers ------------------------------------------------------------

test('resolveRefs inlines a local schema ref', () => {
  const source = {
    components: {
      schemas: {
        Error: { type: 'object', properties: { error: { type: 'string' } } }
      }
    }
  };
  const resolved = resolveRefs({ schema: { $ref: '#/components/schemas/Error' } }, source);
  assert.deepStrictEqual(resolved.schema, {
    type: 'object',
    properties: { error: { type: 'string' } }
  });
  assert.ok(!JSON.stringify(resolved).includes('$ref'));
});

test('resolveRefs terminates on a cycle and marks it', { timeout: 1000 }, () => {
  const cyclic = {
    components: {
      schemas: {
        Node: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            child: { $ref: '#/components/schemas/Node' }
          }
        }
      }
    }
  };
  const resolved = resolveRefs({ $ref: '#/components/schemas/Node' }, cyclic);
  assert.strictEqual(resolved.properties.child.$ref, 'Node (circular)');
  assert.strictEqual(resolved.properties.name.type, 'string');
});

test('resolveRefs leaves a dangling ref readable instead of throwing', () => {
  const resolved = resolveRefs({ $ref: '#/components/schemas/Missing' }, { components: { schemas: {} } });
  assert.strictEqual(resolved.$ref, '#/components/schemas/Missing (unresolved)');
});

test('exampleFromSchema prefers example, then enum, then a type stub', () => {
  assert.strictEqual(exampleFromSchema({ type: 'string', enum: ['a', 'b'], example: 'x' }), 'x');
  assert.strictEqual(exampleFromSchema({ type: 'string', enum: ['a', 'b'] }), 'a');
  assert.strictEqual(exampleFromSchema({ type: 'string' }), 'string');
  assert.deepStrictEqual(
    exampleFromSchema({
      type: 'object',
      properties: { a: { type: 'string' }, b: { type: 'number' } }
    }),
    { a: 'string', b: 0 }
  );
  assert.deepStrictEqual(exampleFromSchema({ type: 'array', items: { type: 'boolean' } }), [false]);
});

test('exampleFromSchema takes the first oneOf branch and merges allOf', () => {
  const oneOf = { oneOf: [
    { type: 'object', properties: { speaker: { example: 'shubh' } } },
    { type: 'object', properties: { voice_id: { example: 'v1' } } }
  ] };
  // One provider's config, never a blend of every provider's keys.
  assert.deepStrictEqual(exampleFromSchema(oneOf), { speaker: 'shubh' });

  const allOf = { allOf: [{ properties: { a: { example: 1 } } }, { type: 'object', properties: { b: { example: 2 } } }] };
  assert.deepStrictEqual(exampleFromSchema(allOf), { a: 1, b: 2 });
});

test('findEndpoint matches exactly and returns null otherwise', () => {
  assert.ok(findEndpoint(doc, '/api/assistant/create', 'post'));
  assert.strictEqual(findEndpoint(doc, '/nope', 'get'), null);
});

test('searchEndpoints caps at 25 and finds the assistant create path', () => {
  const { total, results } = searchEndpoints(doc, 'assistant');
  assert.ok(results.length > 0 && results.length <= 25);
  assert.ok(total >= results.length);
  assert.ok(results.some((entry) => entry.path === '/api/assistant/create'));
});

test('searchEndpoints reports the full match count when it truncates', () => {
  // 'a' matches nearly every operation, so the 25-result cap must bite.
  const { total, results } = searchEndpoints(doc, 'a');
  assert.strictEqual(results.length, 25);
  assert.ok(total > 25);
});

test('listEndpoints filters by tag', () => {
  const auth = listEndpoints(doc, 'Auth');
  assert.ok(auth.every((entry) => entry.tags.includes('Auth')));
  assert.ok(auth.some((entry) => entry.path === '/api/auth/login'));
});

// --- End to end over HTTP ----------------------------------------------------

test('POST /mcp initialize reports the server name and says it is docs-only', async (t) => {
  const { server, base } = await startApp();
  t.after(() => server.close());

  const { status, json } = await mcpPost(base, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' } }
  });

  assert.strictEqual(status, 200);
  // Renamed from intvyom-swagger: the name now says what it is — documentation, not execution.
  assert.strictEqual(json.result.serverInfo.name, 'intvyom-api-docs');
  assert.match(json.result.instructions, /documentation only/i);
  assert.match(json.result.instructions, /cannot call the API/);
});

test('tools/list returns exactly the five tools, each marked docs-only', async (t) => {
  const { server, base } = await startApp();
  t.after(() => server.close());

  const { json } = await mcpPost(base, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const names = json.result.tools.map((tool) => tool.name).sort();
  // get_overview was added so the API-wide conventions in info.description are reachable.
  assert.deepStrictEqual(names, ['get_endpoint', 'get_overview', 'get_schema', 'list_endpoints', 'search_endpoints']);
  assert.ok(json.result.tools.every((tool) => tool.description.startsWith('Docs only')));
});

test('tools/call get_overview carries the auth rule and says it cannot execute', async (t) => {
  const { server, base } = await startApp();
  t.after(() => server.close());

  const { json } = await mcpPost(base, {
    jsonrpc: '2.0',
    id: 9,
    method: 'tools/call',
    params: { name: 'get_overview', arguments: {} }
  });
  const text = json.result.content[0].text;
  assert.ok(text.includes('Authorization: Bearer <api_key>'));
  assert.ok(text.includes('cannot execute requests'));
  assert.ok(text.includes('Base URL: http://localhost:3000'));
});

test('tools/call get_endpoint shows no auth for login', async (t) => {
  const { server, base } = await startApp();
  t.after(() => server.close());

  const { json } = await mcpPost(base, {
    jsonrpc: '2.0',
    id: 10,
    method: 'tools/call',
    params: { name: 'get_endpoint', arguments: { path: '/api/auth/login', method: 'post' } }
  });
  assert.ok(json.result.content[0].text.includes('Auth: none'));
});

test('tools/call get_endpoint returns a resolved, sendable contract', async (t) => {
  const { server, base } = await startApp();
  t.after(() => server.close());

  const { json } = await mcpPost(base, {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'get_endpoint', arguments: { path: '/api/assistant/create', method: 'post' } }
  });

  const text = json.result.content[0].text;
  assert.ok(text.includes('llm_mode'));
  assert.ok(text.includes('Auth: `Authorization: Bearer <api_key>`'));
  // Authored, validated examples are shown; the synthesized fallback is not used here.
  assert.ok(text.includes('Example `pipeline_sarvam`'));
  assert.ok(text.includes('Example `realtime_gemini`'));
  assert.ok(!text.split('**Responses**')[0].includes('Example (synthesized'));
  assert.ok(!text.includes('"$ref"'));
});

test('tools/call get_endpoint resolves $ref path parameters instead of printing undefined', async (t) => {
  const { server, base } = await startApp();
  t.after(() => server.close());

  const { json } = await mcpPost(base, {
    jsonrpc: '2.0',
    id: 11,
    method: 'tools/call',
    params: { name: 'get_endpoint', arguments: { path: '/api/assistant/details/{id}', method: 'get' } }
  });

  const text = json.result.content[0].text;
  assert.ok(text.includes('- id (path, required) string'));
  assert.ok(!text.includes('undefined (undefined)'));
});

test('tools/call answers bad input with readable text, not an exception', async (t) => {
  const { server, base } = await startApp();
  t.after(() => server.close());

  const call = (id, name, args) => mcpPost(base, {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name, arguments: args }
  });

  const unknownPath = await call(4, 'get_endpoint', { path: '/api/nope', method: 'get' });
  assert.ok(unknownPath.json.result.content[0].text.includes('Nearest paths'));

  const unknownSchema = await call(5, 'get_schema', { name: 'Nope' });
  assert.ok(unknownSchema.json.result.content[0].text.includes('Available:'));

  const unknownTag = await call(6, 'list_endpoints', { tag: 'nope' });
  assert.ok(unknownTag.json.result.content[0].text.includes('Valid tags:'));

  // A truncated search says how many matched in total, not the page size twice.
  const truncated = await call(8, 'search_endpoints', { query: 'a' });
  const [, total, shown] = truncated.json.result.content[0].text.match(/(\d+) match\(es\), showing (\d+)/);
  assert.strictEqual(Number(shown), 25);
  assert.ok(Number(total) > 25);

  const noMatch = await call(7, 'search_endpoints', { query: 'zzzzzz' });
  assert.ok(noMatch.json.result.content[0].text.includes('No matches'));
});

test('GET /mcp is 405 because the server is stateless', async (t) => {
  const { server, base } = await startApp();
  t.after(() => server.close());

  const response = await fetch(`${base}/mcp`, {
    headers: { Accept: 'application/json, text/event-stream' }
  });
  assert.strictEqual(response.status, 405);
  const body = await response.json();
  assert.strictEqual(body.error.code, -32000);
});
