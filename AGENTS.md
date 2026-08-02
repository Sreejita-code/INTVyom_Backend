# AGENTS.md

Guidelines for AI agents working in this repository.

## Mandatory skills

- `node-service-structure` — canonical folder layout, layer rules, README
  standard. Any new module, route, schema, or service must land where this
  skill says it belongs. A structure change is not complete until the README
  reflects it in the same change.
- `coding-skills` — senior-engineer discipline for all coding tasks.

## Conventions

- CommonJS JavaScript (no TypeScript, no ESM).
- Express routes live in `src/api/routes/`; business logic in `src/<domain>/`;
  external HTTP clients in `src/services/<upstream>/`; DB access in
  `src/core/db/`.
- All configuration is read in `src/core/config.js` — never `process.env`
  elsewhere.
- Error handling is centralized: route handlers delegate failures via
  `next(err)`; `src/core/middleware/errorHandler.js` shapes every error
  response. No hand-rolled `res.status(...).json({ error })` in handlers.
- Logging goes through `getLogger(module)` from `src/core/logging/logger.js`. No
  `console.*` in application code, and never log an upstream response body — they
  carry API keys.
- `axios` is confined to `src/services/`; domains call `callExternal` instead.
- Tests use `node --test` and mirror `src/` under `tests/`.
- Run `npm test` and `node --check` on changed files before finishing.

## Deviations from the skill

- No `LICENSE` / `NOTICE` / `THIRD_PARTY_LICENSES.md` and no per-file licence
  headers — this repo is not distributed, so the licence machinery the skill
  normally mandates has been stripped from the repo's copy of it. Do not add it back.
- CommonJS JavaScript, not the skill's TypeScript/Bun examples: `src/server.js`,
  `src/index.js`, `npm`, `node --test`.
- One-time migration scripts are deleted once they have run in production; the README
  "Applied migrations" table is the record. Do not re-add them to `scripts/`.
