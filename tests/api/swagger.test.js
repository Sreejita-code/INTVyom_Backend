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

// --- the docs and the validators must name the same values -------------------------------------
// swagger.yaml is the contract the /mcp server hands to agents; the lists below are the ones the
// code enforces. A value in one and not the other is a payload that is documented but refused, or
// accepted but never documented.

const { MODES, RETIRED_CASCADE_MODELS, OPENAI_CASCADE_MODELS, OPENAI_REALTIME_MODELS } = require('../../src/assistant/assistant.rules');
const {
  ELEVENLABS_TTS_MODELS,
  SARVAM_TTS_MODELS,
  SARVAM_TTS_LANGUAGES,
  SARVAM_V4_FLASH_EXTRA_LANGUAGES,
} = require('../../src/assistant/tts-rules');

const schemas = doc.components.schemas;
const assistantModeEnums = () => {
  const found = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    if (node.assistant_mode?.enum) found.push(node.assistant_mode.enum);
    if (node.llm_mode?.enum) found.push(node.llm_mode.enum);
    Object.values(node).forEach(walk);
  };
  walk(doc);
  return found;
};

test('every assistant_mode / llm_mode enum in swagger.yaml lists exactly the modes the code accepts', () => {
  const enums = assistantModeEnums();
  assert.ok(enums.length >= 5, 'mode enum scan found too few enums');
  for (const values of enums) assert.deepStrictEqual([...values].sort(), [...MODES].sort());
});

test('TTS enums in swagger.yaml match tts-rules', () => {
  assert.deepStrictEqual(
    [...schemas.ElevenLabsTtsConfig.properties.model.enum].sort(),
    [...ELEVENLABS_TTS_MODELS].sort()
  );
  assert.deepStrictEqual(schemas.SarvamTtsConfig.properties.model.enum, SARVAM_TTS_MODELS);
  assert.deepStrictEqual(
    [...schemas.SarvamTtsConfig.properties.target_language_code.enum].sort(),
    [...SARVAM_TTS_LANGUAGES, ...SARVAM_V4_FLASH_EXTRA_LANGUAGES].sort()
  );
});

test('the LLM model description names every accepted model and the retired ones with their status', () => {
  const text = schemas.AssistantLlmConfig.properties.model.description;
  for (const model of [...OPENAI_CASCADE_MODELS, ...OPENAI_REALTIME_MODELS, 'gpt-live-1']) {
    assert.ok(text.includes(`\`${model}\``), `AssistantLlmConfig.model does not mention ${model}`);
  }
  for (const retired of Object.keys(RETIRED_CASCADE_MODELS)) {
    assert.ok(/removed/.test(text) && text.includes(`\`${retired}\``), `${retired} is not documented as removed`);
  }
});

test('the documented duplex fields exist on AssistantLlmConfig', () => {
  const props = schemas.AssistantLlmConfig.properties;
  assert.strictEqual(props.backend_instructions.maxLength, 4000);
  assert.ok(props.backend_model && props.reasoning_effort && props.voice);
});

test('documented 400 messages are the ones the code produces', () => {
  const { assertLlmModelAllowedInMode } = require('../../src/assistant/assistant.rules');
  const { assertTtsConfigAllowed } = require('../../src/assistant/tts-rules');
  const { validateAssistantConfiguration } = require('../../src/assistant/assistant.validation');
  const examples = (p, m) => doc.paths[p][m].responses['400'].content['application/json'].examples;
  const documented = (p, m, name) => examples(p, m)[name].value.error;

  for (const [p, m] of [['/api/assistant/create', 'post'], ['/api/assistant/update/{id}', 'patch']]) {
    assert.throws(
      () => assertLlmModelAllowedInMode('cascade', 'openai', p.includes('create') ? 'gpt-5.1' : 'gpt-5.4-nano'),
      { message: documented(p, m, 'retired_model') }
    );
  }
  assert.strictEqual(
    validateAssistantConfiguration({
      assistant_mode: 'duplex',
      assistant_greeting_audio: { enabled: true, audio_id: 'a' },
    }).message,
    documented('/api/assistant/create', 'post', 'duplex_greeting_audio')
  );
  assert.strictEqual(
    validateAssistantConfiguration({
      assistant_mode: 'duplex',
      assistant_greeting_audio: { enabled: true },
    }).message,
    documented('/api/assistant/update/{id}', 'patch', 'duplex_stored_greeting')
  );
  assert.throws(
    () => assertTtsConfigAllowed('elevenlabs', { model: 'eleven_v4', voice_settings: { speed: 1 } }),
    { message: documented('/api/assistant/create', 'post', 'elevenlabs_ignored_setting') }
  );
});

test('the AssistantLlmConfig schema example is one sendable cascade config, not a blend of modes', () => {
  const { validateAssistantConfiguration } = require('../../src/assistant/assistant.validation');
  const example = schemas.AssistantLlmConfig.example;
  assert.ok(example, 'without an example the /mcp generator blends every mode\'s knobs');
  assert.strictEqual(validateAssistantConfiguration({ assistant_mode: 'cascade', assistant_llm_config: example }).isValid, true);
});
