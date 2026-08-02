---
name: node-service-structure
description: >
  The canonical folder layout, naming conventions, and README standard for
  OneSpace Node.js/Bun backend services (TypeScript + async). Use when
  scaffolding a new Node or Bun service, restructuring or cleaning up an
  existing one, deciding where a new module belongs, reviewing a layout, or
  when asked to "structure this repo", "where should this file go", "fix the
  folder structure", or "update the README". Self-contained — works unchanged
  in any repo it is copied into.
---

# Node/Bun Service Structure

Target state for every OneSpace Node.js/Bun backend service. A new developer
should understand where things live from the directory names alone, without
reading a single function body.

> **A great developer seeks simplicity. An idiot developer seeks complexity.**

If the task is a general refactor (splitting overgrown functions, renaming,
deleting dead code), follow the phased discipline in the `codebase-structuring`
skill — understand → audit → plan → **get approval** → execute → document. This
skill defines the *target layout* that discipline aims at; it does not replace it.

---

## Canonical layout

```
repo/
├── src/server.ts               # app entry only: route mounts, middleware,
│                               #   lifecycle hooks (start/close), error handlers
├── src/index.ts                # production runner (Bun.serve / Node listen, workers)
├── package.json                # single manifest
├── bun.lockb / pnpm-lock.yaml
├── tsconfig.json
├── README.md                   # see "README standard" below
├── AGENTS.md                   # mandatory skills for agents working in this repo
├── Dockerfile
├── docker-compose.yml
├── .env.example                # every var, safe placeholder values, no secrets
├── .agents/skills/              # repo-scoped agent skills
├── docs/                        # long-form docs, served if built
├── tests/                       # test suite, mirrors src/ layout
└── src/
    ├── api/                     # HTTP surface — no business logic
    │   ├── routes/              # one module per endpoint group
    │   │   ├── <area>.ts
    │   │   └── v1/              # versioned subpackage; common.ts for shared deps
    │   └── schemas/              # zod (or equivalent) request/response schemas
    │       └── responseEnvelope.ts   # the shared response envelope
    ├── <domain>/                 # business logic (e.g. agents/, billing/, ingest/)
    ├── services/                  # external I/O clients ONLY — one dir per upstream
    │   └── <upstream>/<upstream>Service.ts
    └── core/                      # cross-cutting infrastructure
        ├── config.ts             # ONE Settings singleton reading process.env
        ├── db/
        │   ├── dbConnect.ts      # connection lifecycle (init/close)
        │   ├── dbSchema.ts       # models/table definitions
        │   └── functions/        # query helpers, one file per concern
        ├── middleware/
        └── logging/logger.ts     # setupLogging() once, getLogger(module) everywhere
```

Grow it by adding siblings at the right layer, never by nesting a new concern
inside an unrelated one.

## Layer rules

Each rule below exists because breaking it is what actually rots a service.

**`src/server.ts` is wiring, not logic.** Route mounts, middleware, lifecycle
hooks, error handlers. If it contains a business rule, that rule belongs in
`src/<domain>/`.

**`src/api/` is the HTTP surface only.** A route handler validates input,
delegates, and shapes the response. No queries, no external calls, no
branching business rules inside a handler body. Shared dependencies (auth,
tenant header) live in a `common.ts` in the route package, not duplicated per
route.

**`src/api/schemas/` holds validation/response schemas, one file per scope**
(`common.ts`, `<feature>.ts`, `responseEnvelope.ts`). Never mix schemas into
route modules.

**`src/services/` is external I/O and nothing else.** One directory per
upstream system. Each service module exposes the pair:

- `call<X>Endpoint(...)` — performs the request
- `condense<X>Response(...)` — strips envelope noise at the boundary, so
  callers never see the upstream's wire format

**Condense at the boundary.** Upstream payloads are normalised the moment
they arrive. Envelope noise must not leak upward into domain code.

**`src/core/config.ts` owns configuration.** One `Settings` object/module,
one exported singleton, every value read there. Scattered `process.env` calls
elsewhere are a defect — they hide the config surface and break `.env.example`.

**One response envelope.** Success *and* every error path return the same
shape. Register error-handling middleware centrally in `src/server.ts` so no
route hand-rolls an error body.

**`tests/` mirrors `src/`.** `src/services/rag/ragService.ts` →
`tests/services/ragService.test.ts`. Non-trivial logic leaves at least one
runnable check.

**One responsibility per file.** If a file needs a table of contents, split
it. Typical split: `builder.ts` (construction) + `schemas.ts`/`types.ts`
(data) + `<x>Service.ts` (I/O).

**One job per function.** If describing it needs the word "and", split it.

**Async is explicit and awaited.** No dangling promises, no mixing
callback-style APIs with async/await without wrapping them. Every `await`
site that can reject has a defined error path (try/catch, or bubbled to
centralized error middleware) — never a silent swallow.

**Names tell the story.** `camelCase` files for modules, `PascalCase` only for
classes/types, no `utils.ts` dumping ground, no `tmp`, `data2`,
`handleStuff`. A public name should reveal intent without the body.

**No dead code.** Delete it. Never leave commented-out blocks behind.

**Docstrings/JSDoc on public functions/classes** stating *what* and *why*.
The code already shows *how*.

## Where does this new file go?

| It … | Put it in |
|------|-----------|
| defines an HTTP endpoint | `src/api/routes/` (versioned subdir if the API is versioned) |
| is a request/response validation schema | `src/api/schemas/` |
| talks to a third-party or sibling service over the network | `src/services/<upstream>/` |
| encodes a business rule or orchestration | `src/<domain>/` |
| reads env / configures the process | `src/core/config.ts` (extend, don't add a new config module) |
| touches the database | `src/core/db/` (`dbSchema.ts` for models, `functions/` for queries) |
| wraps every request | `src/core/middleware/` |
| is a test | `tests/`, named after the module under test |

## README standard

The README is part of the deliverable, not an afterthought. **A structure
change is not complete until the README reflects it in the same change.**

Required sections, in order:

1. **Title + what it is** — one paragraph, plus the core model/concepts if
   the service has a non-obvious one
2. **Response envelope** — the shape every endpoint returns
3. **Requirements** — Node/Bun version, package manager, external services
   (DB, queues, upstreams)
4. **Installation** — local (`bun install`, dev server command) *and* Docker
5. **Environment** — table of every var: name, default, note. Must match
   `src/core/config.ts` and `.env.example` exactly
6. **Endpoints** — quick-reference table: method, path, purpose
7. **Project Structure** — the directory tree with a one-line comment per entry
8. **Data stores** — collections/tables, what keys them, what they hold
9. **Stack** — layer → technology table

Rules: if it exists, read it before changing anything. If it is missing,
create it. After any change, re-check the **whole** README for staleness —
env vars, endpoints, and the structure tree drift first and fastest.

## Working procedure

1. **Read before changing.** Walk the tree, read the entrypoint, map module
   dependencies. Never restructure code you have not read.
2. **Audit** against the layer rules above; list each violation with its path.
3. **Plan** — before/after tree, file splits, function decompositions,
   renames with rationale, docs to update. **Present the plan and wait for
   approval.**
4. **Execute** — `git mv` to preserve history, move code, split oversized
   files and functions, update every import, delete dead code. External
   behaviour must not change: no feature changes, no regressions.
5. **Document** — update the README (tree, env, endpoints), add JSDoc to new
   public APIs.
6. **Verify** — the app still boots, the test suite result is no worse than
   the baseline captured in step 1, config/build files still parse and
   typecheck.

## New service scaffold

Minimum viable repo — do not scaffold layers nothing uses yet. Add
`src/<domain>/`, `src/core/db/`, and `src/core/middleware/` when the first
real need arrives, not "for later".

```
src/server.ts  package.json  README.md  .env.example  Dockerfile  AGENTS.md
src/api/routes/  src/api/schemas/responseEnvelope.ts
src/core/config.ts  src/core/logging/logger.ts
src/services/
tests/
```

---

## Porting this skill to another repository

1. Copy the whole `node-service-structure/` directory into the target repo's
   `.agents/skills/`.
2. Mirror it to other agent toolchains in use (symlink keeps one source of truth):
   ```bash
   mkdir -p .claude/skills .opencode/skills
   ln -s ../../.agents/skills/node-service-structure .claude/skills/node-service-structure
   ln -s ../../.agents/skills/node-service-structure .opencode/skills/node-service-structure
   ```
3. Ensure the repo has a root `AGENTS.md` naming this skill as mandatory.