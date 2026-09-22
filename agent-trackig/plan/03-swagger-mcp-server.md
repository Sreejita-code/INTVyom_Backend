# Plan 03 — Serve `swagger.yaml` as an MCP server on the Express app

**Status:** ready to execute
**Depends on:** nothing technically. Read the warning in section 1 before starting — the value of
this work depends on Plan 01 having landed.
**Blocks:** nothing
**Written:** 2026-09-22

Read `CLAUDE.md` and `AGENTS.md` before starting. Every SDK fact in this plan was verified against
the published `@modelcontextprotocol/sdk@1.30.0` package on 2026-09-22; the check is given where it
matters. Do not extend an API signature from memory — the SDK moves.

---

## 1. The gap

The frontend agent has no machine-readable source for this backend's contracts. Request bodies,
enum values and response shapes get hand-copied out of `swagger.yaml` — 3715 lines, 49 paths, 8
shared schemas under `components.schemas`, 104 `$ref` pointers — into frontend code. That is slow,
and it drifts the moment the YAML changes.

The repo already consumes an MCP server this exact way: `.mcp.json` attaches `api-livekit-docs` as
`{"type": "http", "url": "..."}` and agents call `list_docs` / `search_docs` / `get_doc` against it.
This plan gives the same affordance for *this* backend's own API, mounted on the app that already
parses the YAML (`src/server.js:34`, `YAML.load` for `swagger-ui-express`).

### Decisions already taken — do not re-open

The user was asked and chose, on 2026-09-22:

| Question | Chosen | Consequence |
|---|---|---|
| Transport | **HTTP route on the Express app** | Frontend agent attaches by URL from anywhere. No stdio entrypoint. Backend must be running. |
| Protocol layer | **`@modelcontextprotocol/sdk`** | Two new runtime dependencies (`@modelcontextprotocol/sdk`, `zod`). No hand-rolled JSON-RPC. |
| Tool surface | **4 tools** | `list_endpoints`, `search_endpoints`, `get_endpoint`, `get_schema`. No `example_payload` tool — the example is folded into `get_endpoint`. |

### Warning — this server is only as correct as `swagger.yaml`

`agent-trackig/plan/01-model-lists-and-validation.md` documents exactly where `swagger.yaml` is
stale: the Gemini model list (lines 56-68), five retired OpenAI model ids (lines 80-83), the STT
model table (lines 94-98), the `model` field description (lines 3365-3374), the ElevenLabs TTS enum
(line 3514) and `assistant_stt_config.model` (lines 3573-3579).

This MCP serves that content verbatim. Today a developer reading a stale table may notice it looks
old; an agent receiving it from a tool call will not. **Land Plan 01, or at minimum its
documentation step, before pointing the frontend agent at this server.** Nothing in this plan edits
that content — fixing it here would duplicate Plan 01 and produce a merge conflict.

### Verified facts about the SDK (checked 2026-09-22, do not re-guess)

- Version `1.30.0`. `package.json` has `"type": "module"` but ships a **dual build**: the `exports`
  map routes the `require` condition to `dist/cjs/*`. `dist/cjs/server/mcp.js` and
  `dist/cjs/server/streamableHttp.js` both exist (HTTP 200 on unpkg). This repo stays
  `"type": "commonjs"` — plain `require()` works, no `await import()`, no ESM migration.
- `zod` is an SDK dependency at `^3.25 || ^4.0`, and tool input schemas are **zod raw shapes**, so
  `zod` must be a direct dependency of this repo too. Do not rely on hoisting.
- Stateless Streamable HTTP is `new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })`
  followed by `await transport.handleRequest(req, res, req.body)`.
- `McpServer#registerTool(name, config, cb)` is the current API. The older `server.tool(...)`
  overloads are marked `@deprecated` in `1.30.0` — do not use them.

---

## 2. Steps

### Step 1 — Add the dependencies

```bash
npm install @modelcontextprotocol/sdk zod
```

Both belong in `dependencies` (the server needs them at runtime, not just in tests). Verify the CJS
condition resolves before writing any code:

```bash
node -e "const {McpServer}=require('@modelcontextprotocol/sdk/server/mcp.js'); console.log(typeof McpServer)"
node -e "const {StreamableHTTPServerTransport}=require('@modelcontextprotocol/sdk/server/streamableHttp.js'); console.log(typeof StreamableHTTPServerTransport)"
```

Both must print `function`. If either throws `ERR_PACKAGE_PATH_NOT_EXPORTED` or
`ERR_REQUIRE_ESM`, **stop and report** — do not convert this repo to ESM to work around it, and do
not silently fall back to hand-rolled JSON-RPC. That is a decision for the user.

### Step 2 — `src/mcp/swagger-index.js` (new file): pure helpers

No MCP, no Express, no I/O. Pure functions over the already-parsed swagger object, so they are
testable without a server. This is the `src/<domain>/` layer per `AGENTS.md`; the router in step 3
is the only part that knows about HTTP.

Export five functions:

**`resolveRefs(node, doc)`** — returns a deep copy with every local `$ref`
(`#/components/schemas/Foo`) replaced by the object it points at, recursively. Requirements:

- Only local refs. A non-local `$ref` (starts with anything but `#/`) is left as-is.
- Cycle guard: carry a `Set` of ref strings down the current branch. On re-entry, emit
  `{ $ref: '<SchemaName> (circular)' }` instead of recursing. `Assistant` embeds config objects, so
  a cycle is plausible and an unguarded resolver hangs the request.
- Arrays, `allOf` / `oneOf` / `anyOf` members and `items` all get the same treatment.
- A dangling ref (target missing) becomes `{ $ref: '<pointer> (unresolved)' }`, never a throw.

**`exampleFromSchema(schema)`** — one example value, in this precedence order:

1. `schema.example` if present (the YAML already carries 133 of them — use them)
2. `schema.default`
3. `schema.enum[0]`
4. by `type`: `object` → recurse over `properties`; `array` → one-element array of
   `exampleFromSchema(items)`; `string` → `'string'` (or `'2026-01-01T00:00:00Z'` when
   `format: date-time`); `integer` / `number` → `0`; `boolean` → `false`
5. unknown / missing type → `null`

Run it on an **already-resolved** schema so it never has to chase a `$ref`. `nullable: true` is
ignored — emit the value, not `null`, because the point is a sendable example.

**`listEndpoints(doc, tag)`** — `[{ method, path, tags, summary }]` over `doc.paths`, method
upper-cased, skipping non-operation keys (`parameters`, `servers`, `$ref`, `summary`,
`description`). `tag` filter is case-insensitive; omitted means all.

**`findEndpoint(doc, path, method)`** — exact path match (leading slash normalised), method
case-insensitive. Returns `{ operation, path, method }` or `null`.

**`searchEndpoints(doc, query)`** — case-insensitive substring match, scored by how many fields
matched, over: path, `summary`, `description`, `tags`, and the property names appearing in the
request body and response schemas (resolve first, then collect keys). Return the top 25.

`module.exports = { resolveRefs, exampleFromSchema, listEndpoints, findEndpoint, searchEndpoints }`.

### Step 3 — `src/mcp/swagger-mcp.js` (new file): tools and router

Exports one function, `createMcpRouter(swaggerDocument)`, returning an `express.Router()`.

Stateless per request — no session store, no SSE fan-out, no cleanup cron:

```js
const express = require('express');
const { z } = require('zod');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');

const createMcpRouter = (doc) => {
  const router = express.Router();

  router.post('/', express.json(), async (req, res) => {
    const server = buildServer(doc);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  const methodNotAllowed = (req, res) => res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed. This MCP server is stateless; use POST.' },
    id: null,
  });
  router.get('/', methodNotAllowed);
  router.delete('/', methodNotAllowed);

  return router;
};
```

`express.json()` is applied on the route even though `src/server.js:31` already calls
`app.use(express.json())` — harmless, and it keeps the router self-contained if the global parser
ever moves. `buildServer(doc)` constructs `new McpServer({ name: 'intvyom-swagger', version: <the
version from package.json> })` and registers the four tools below. Every tool returns
`{ content: [{ type: 'text', text }] }`.

Wrap each handler body in try/catch and return the error as **text**, not a thrown exception: a
throw becomes an opaque JSON-RPC internal error and the agent learns nothing.

#### `list_endpoints`

- Input: `{ tag: z.string().optional() }`
- Description: "List every endpoint in the INTVyom backend API, optionally filtered by tag."
- Output: one line per endpoint —
  `POST /api/assistant/create — [Assistant] Create a voice assistant`
- Unknown tag: say so and list the valid tag names from `doc.tags`.

#### `search_endpoints`

- Input: `{ query: z.string() }`
- Description: "Find endpoints by path, summary, description, tag or field name."
- Output: the same line format, ranked, capped at 25, with a trailing
  `<n> match(es), showing <m>` line.
- No match: say so and suggest `list_endpoints`.

#### `get_endpoint` — the tool that carries the actual ask

- Input: `{ path: z.string(), method: z.string().default('get') }`
- Description: "Full request and response contract for one endpoint, with `$ref`s resolved and a
  ready-to-send example request body."
- Output, in this fixed order:
  1. `### <METHOD> <path>` then tags, summary, description
  2. **Parameters** — a line per path/query/header param: name, `in`, required, type, description
  3. **Request body** — content type, then the fully resolved JSON Schema via
     `JSON.stringify(resolveRefs(schema, doc), null, 2)`
  4. **Example request** — `exampleFromSchema` output as pretty JSON. The agent must be able to
     paste this straight into a request body with no edits and no `$ref` left in it.
  5. **Responses** — per status code: description, resolved schema, generated example
- Unknown path or method: return text naming the 5 nearest paths by substring, plus the methods
  that *do* exist on that path when the path matched but the method did not.

#### `get_schema`

- Input: `{ name: z.string() }`
- Description: "One shared schema from `components.schemas`, resolved, with an example object."
- Output: resolved schema JSON + generated example.
- Unknown name: list the available names (`Error`, `Assistant`, `AssistantInteractionConfig`,
  `AssistantLlmConfig`, `AssistantTtsConfig`, `AssistantSttConfig`, `SipTrunk`, `UserIdAuth`).

### Step 4 — Mount it in `src/server.js`

`swaggerDocument` is already parsed at line 34. Pass that same object — do not load the YAML twice.

```js
const createMcpRouter = require('./mcp/swagger-mcp');
// ...
const swaggerDocument = YAML.load(path.join(__dirname, '..', 'swagger.yaml'));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use('/mcp', createMcpRouter(swaggerDocument));
```

Place the mount immediately after `/api-docs`, before the `/api/*` routers, so documentation wiring
stays grouped. `/mcp` sits outside `/api`, so the `requireAuth` middleware from
`agent-trackig/plan/02-authentication-bearer-api-key.md` will not cover it and needs no exemption
entry — if you are executing both plans, confirm that is still true after Plan 02's step 2.

**Security note, in plain English.** This endpoint is unauthenticated and returns the complete
description of the API surface. That is the same content `/api-docs` already serves publicly from
the same app, so it exposes nothing that was not already exposed — but it does mean anyone who can
reach the server can read the whole contract. If the deployment ever puts `/api-docs` behind a
network rule, an IP allowlist or a proxy, put `/mcp` behind the same rule at the same time. The
endpoint is read-only by construction: it never touches MongoDB, never calls the upstream LiveKit
API, and holds no credentials. Do not add a tool that performs live requests.

### Step 5 — Tests: `tests/mcp/swagger-mcp.test.js` (new file)

`node:test` + `node:assert`, path mirroring `src/mcp/`, no new test dependency. Two groups.

**Pure helpers** (no server):

- `resolveRefs` inlines `#/components/schemas/Error` into a wrapper object.
- `resolveRefs` terminates on a hand-built cyclic document and marks the cycle. Give this test a
  short timeout — if it hangs, the cycle guard is missing.
- `exampleFromSchema` prefers `example` over `enum`, `enum` over the type stub; a nested object
  recurses; an array yields one element.
- `findEndpoint(doc, '/api/assistant/create', 'post')` is non-null; `findEndpoint(doc, '/nope', 'get')`
  is `null`.
- `searchEndpoints(doc, 'assistant')` returns at most 25 and includes `/api/assistant/create`.

**End to end over HTTP**, reusing the pattern already in `tests/api/app.test.js` — `createApp()`,
`listen(0, '127.0.0.1')`, `t.after(() => server.close())`, plain `fetch`:

- `POST /mcp` with an `initialize` request answers `200` and reports
  `result.serverInfo.name === 'intvyom-swagger'`.
- `tools/list` returns exactly the four names.
- `tools/call` `get_endpoint` with `{ path: '/api/assistant/create', method: 'post' }` returns text
  containing `llm_mode` and the `Example request` heading, and containing **no** `"$ref"` substring.
- `GET /mcp` answers `405`.

Implementer note: the Streamable HTTP transport requires the client to send
`Accept: application/json, text/event-stream` and `Content-Type: application/json`. A request
missing the `Accept` header is rejected by the transport before any tool runs. Set both headers in
every test `fetch`. The response may come back as SSE framing (`event: message\ndata: {...}`) rather
than a bare JSON body — parse defensively: if the body starts with `event:`, take the first line
beginning `data: ` and `JSON.parse` the remainder. Write one small helper in the test file for this
rather than repeating it.

### Step 6 — Documentation, in this same change

**`swagger.yaml`:**
- Add a `Docs` entry to the `tags:` block (around line 214), description
  `MCP server exposing this API's own contracts`.
- Add a `/mcp` path under `paths:`: `post`, tag `Docs`, summary
  `MCP (Model Context Protocol) JSON-RPC endpoint`, request body a JSON-RPC 2.0 envelope
  (`jsonrpc`, `id`, `method`, `params`), `200` a JSON-RPC result, `405` for `GET`/`DELETE`.
  Document in the description that it is stateless, read-only and unauthenticated.
- Re-validate: `node -e "const y=require('yamljs');y.load('swagger.yaml')"`.

**`README.md`:** add a short "Swagger MCP server" section covering what the endpoint is, the four
tools in one line each, and the snippet the frontend repo pastes into its `.mcp.json`:

```json
{ "mcpServers": { "intvyom-swagger": { "type": "http", "url": "http://localhost:3000/mcp" } } }
```

Document the trap, not just the fields: **the server reads `swagger.yaml` once at process start, so
a swagger edit needs a backend restart before the frontend agent sees it.** Also note that the
endpoint describes the API and never calls it.

**`AGENTS.md`:** no change. No convention changed.

---

## 3. Verification

```bash
npm test
node --check src/mcp/swagger-index.js
node --check src/mcp/swagger-mcp.js
node --check src/server.js
node -e "const y=require('yamljs');y.load('swagger.yaml')"
```

Then, with the server running (`npm start`):

```bash
curl -s http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | head -c 400

curl -s http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_endpoint","arguments":{"path":"/api/assistant/create","method":"post"}}}' \
  | grep -c '\$ref'    # must print 0
```

Real attach check: add the `.mcp.json` snippet to the frontend repo, run `claude mcp list` there,
confirm `intvyom-swagger` connects, then ask that agent for the create-assistant payload. It should
come back with `llm_mode`, `llm_config` and a sendable example body, with no `$ref` anywhere.

## 4. Acceptance checklist

- [ ] `POST /mcp` speaks MCP: `initialize`, `tools/list` and `tools/call` all answer
- [ ] Four tools registered; each returns readable text for a valid input **and** for a bad one
- [ ] `get_endpoint` output contains a complete example request body with zero `$ref` left
- [ ] Cyclic schema does not hang the request
- [ ] `npm test` green, including `tests/mcp/swagger-mcp.test.js`
- [ ] `swagger.yaml` still parses; `/mcp` documented there and in `README.md`
- [ ] No existing route, response shape or status code changed
- [ ] `@modelcontextprotocol/sdk` and `zod` in `dependencies`, lockfile committed

## 5. Effect on existing users

None at runtime. This adds one new path (`/mcp`) and changes no existing handler, schema, default or
status code. Two new dependencies enter the install, so a deploy must run `npm install` — flag that
in the deploy note.

## 6. Deliberately NOT doing

- **No stdio entrypoint** (`scripts/swagger-mcp.js`). HTTP was chosen. Add one later only if the
  frontend agent ends up somewhere that cannot reach the backend.
- **No auth on `/mcp`.** It matches `/api-docs`, which is already open. Revisit together with
  Plan 02 if that plan ever closes `/api-docs` too.
- **No session mode, no SSE resumability, no session store.** Stateless request-response is enough
  for schema lookups; sessions add storage and a cleanup path for no gain here.
- **No MCP resources and no prompts** — tools only. Tools are what an agent actually calls.
- **No content fixes to `swagger.yaml`.** The stale model lists, retired ids and STT table belong to
  Plan 01. Touching them here duplicates that work and creates a conflict.
- **No live-request proxying.** This server *describes* the API; it does not call it. A tool that
  fired real requests would need credentials and could mutate user data.
- **No file watcher on `swagger.yaml`.** Restart after a swagger edit; documented in the README
  instead of built.
- **No generated TypeScript types or client SDK for the frontend.** Different job. If the frontend
  wants types rather than answers, say so and we plan `openapi-typescript` separately.
