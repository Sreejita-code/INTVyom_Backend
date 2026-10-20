# Plan — 2026-10-20-feature-docs-split-and-internals-mcp

**Goal:** Split docs into three audiences (README = run it, `docs/` = understand it, swagger/MCP = call it) and extend `/mcp` so a frontend agent can also read internals and the changelog.

## Success criteria
1. README only covers requirements, env, run, docker, deploy, scripts, and links out.
2. `docs/` holds ARCHITECTURE, UPSTREAM, DATA, DEVELOPING, CHANGELOG.
3. `/mcp` serves them via three new docs-only tools; existing five unchanged.
4. Production image contains `docs/`.
5. `npm test` green, new tests per criterion.

## Design decisions
- Plain Markdown, no site generator, no new dependency.
- Docs are read once at startup into a Map keyed by filename (without `.md`). `get_dev_doc` looks up in the Map; user input never touches the filesystem, so no path traversal.
- New file `src/mcp/dev-docs.js`: loads `docs/*.md`, exports `listDocs`, `getDoc`, `getChangelog`. `swagger-mcp.js` registers three tools from it. Router stays stateless.
- New tools: `list_dev_docs` (name + first heading), `get_dev_doc(name)`, `get_changelog(limit=5)` (newest entries; split on `## ` headings).
- Failure mode: a missing docs dir at startup logs a warning and the tools answer "no docs found" text; the five swagger tools keep working. Unknown name returns readable text listing valid names (same style as `get_schema`).
- Public/unauthenticated exposure same as swagger. Docs hold no secrets.
- No env vars, no data changes, no migrations, no endpoint behaviour changes.

## Steps
- [ ] 1. `src/mcp/dev-docs.js` + test `tests/mcp/dev-docs.test.js` (list, get, unknown name, changelog limit, traversal-looking name like `../package` is just "unknown").
- [ ] 2. Register three tools in `src/mcp/swagger-mcp.js`; update INSTRUCTIONS text; update the "exactly five tools" test to eight and add tool-call tests.
- [ ] 3. Write `docs/ARCHITECTURE.md` (layers, request path, tree moved from README, billable-minutes note), `docs/UPSTREAM.md` (how the proxy uses LiveKit: `callExternal`, key flow, call-upstream-first then local mirror, 404/400 already-in-state handling, resync), `docs/DATA.md` (data stores table moved), `docs/DEVELOPING.md` (conventions, adding an endpoint + swagger in same change, tests, scripts, migrations policy), `docs/CHANGELOG.md` (seeded from git log, breaking changes flagged). Facts verified against code while writing, not from memory.
- [ ] 4. Drift guard test: every `src/<domain>/` directory is named in `docs/ARCHITECTURE.md`.
- [ ] 5. Slim README to run-only; add "Documentation" section (docs/ files, `/api-docs`, `/mcp` connect snippet with eight tools). Remove endpoint list.
- [ ] 6. `swagger.yaml` info.description: one line pointing agents to `/mcp`. `Dockerfile`: `COPY docs ./docs`. `AGENTS.md` Project structure: add `docs/` row and `src/mcp/dev-docs.js`.
- [ ] 7. Fresh-context reviewer pass; full `npm test`, `node --check`, yamljs load of swagger.

## Deliberately NOT doing
- No VitePress/Docusaurus/mkdocs-like site (can wrap `docs/` later without rewriting).
- No auto-diff of swagger vs git history.
- No auth on `/mcp`, no MCP tool that calls the API.
- No generated swagger-to-markdown endpoint reference; swagger stays the only endpoint source.
- No changes to routes, validation, or data.
- Not auditing the existing code for bugs beyond what I notice while writing docs (noted in progress.md if found).

## Risks
| Risk | Mitigation |
|------|-----------|
| Docs drift from code | Step 4 test; DEVELOPING.md says "doc change in same PR"; AGENTS.md already requires it |
| `docs/` missing in image | Dockerfile COPY (step 6); startup warning if absent |
| README cut removes info readers need | Everything moves, nothing deleted; README links each destination |
| Public internals exposure | No secrets in docs; same exposure class as `/api-docs` |

## Rollback
All additive except README trim and one test count. `git revert` the change; no data or config to undo. Image rollback = previous image tag.

## Verification
`npm test` (all green), `node --check src/mcp/*.js`, `node -e "const y=require('yamljs');y.load('swagger.yaml')"`, manual: `curl -X POST :3000/mcp` tools/list shows 8 tools.
