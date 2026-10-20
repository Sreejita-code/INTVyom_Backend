# Developing

Read after the README has you running. Architecture: [ARCHITECTURE](ARCHITECTURE.md). Upstream
integration: [UPSTREAM](UPSTREAM.md). Contract: `swagger.yaml`.

## Conventions

- CommonJS JavaScript, Node 20+, `zod` for input validation.
- Routes (`src/api/routes/`) validate, delegate and shape. Business logic in `src/<domain>/`,
  external HTTP only in `src/services/<upstream>/`, DB access in `src/core/db/`.
- Identity comes from `req.user` (set by `requireAuth`). A `user_id` in a body or query string
  is ignored.
- Configuration is read only in `src/core/config.js`; add every new variable to `.env.example`.
- Failures are thrown with `err.status` and answered by `errorHandler`. No hand-built error bodies.
- Logging through `getLogger(module)`. No `console.*`, and never log an upstream response body.
- `axios` appears only under `src/services/`.

## Adding or changing an endpoint

1. Read the upstream page for it with the `api-livekit-docs` MCP. Never guess a path or field.
2. Route in `src/api/routes/`, logic in the domain, upstream call through `callExternal`.
3. Update `swagger.yaml` in the same change. `tests/api/swagger.test.js` fails when a mounted
   route and the YAML disagree. The docs MCP serves this file, so the frontend agent sees it
   after a backend restart.
4. Add a line to `docs/CHANGELOG.md`, marked **BREAKING** when an existing client could break.
5. Add a test under `tests/` mirroring `src/`.

## Protect existing users

Stored assistants, trunks and integrations are live. A new rejection must not lock a user out of a
record they need to repair, a changed default silently rewrites behaviour for everyone, and
migrations for existing rows ship with the change.

## Tests and checks

```bash
npm test                                   # node --test, supertest, proxyquire
node --check <changed-file>
node scripts/check-assistant-payload.js    # when assistant payload rules changed
node src/integration/providers.js          # when the provider/key map changed
node -e "const y=require('yamljs');y.load('swagger.yaml')"   # after editing swagger.yaml
```

## Docs and the MCP

| Audience | File | Served by |
|---|---|---|
| Run it | `README.md` | GitHub |
| Understand it | `docs/*.md` | GitHub, and MCP `list_dev_docs` / `get_dev_doc` |
| Call it | `swagger.yaml` | `/api-docs`, and MCP `get_endpoint` / `get_schema` |
| What changed | `docs/CHANGELOG.md` | MCP `get_changelog` |

`docs/` is read once at startup and copied into the Docker image, so a docs edit needs a restart.
Docs are public (the MCP is unauthenticated): never put keys, tokens, customer data or internal
hostnames in them. `tests/mcp/architecture.test.js` fails when a `src/` folder is missing from
`docs/ARCHITECTURE.md`.
