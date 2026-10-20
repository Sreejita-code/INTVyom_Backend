# Research — 2026-10-20-feature-docs-split-and-internals-mcp

## Project structure
Layered, grouped by domain (AGENTS.md → Project structure). MCP code lives in `src/mcp/`.

## What already exists
- `/mcp` (Streamable HTTP, stateless, unauthenticated) mounted in `src/server.js:42`, built in `src/mcp/swagger-mcp.js` (315 lines) + `src/mcp/swagger-index.js` (230 lines). Five docs-only tools: `get_overview`, `list_endpoints`, `search_endpoints`, `get_endpoint`, `get_schema`. All read the parsed `swagger.yaml`.
- Frontend payload/response need is therefore already served. Gap: internals ("how it uses the core"), and "what changed".
- `@modelcontextprotocol/sdk` and `zod` already installed; no new dependency needed.
- `tests/mcp/swagger-mcp.test.js` asserts exactly five tools (line ~161); it must change with the tool count.
- `Dockerfile` runtime stage copies only `package.json`, `src`, `swagger.yaml`. A new `docs/` folder is NOT in the image unless a COPY line is added (distroless image, no shell). Without it the new tools would fail in production only.
- README (781 lines): endpoint list lines 173-633 duplicates swagger.yaml; Project Structure (639-733) and Data Stores (734-750) are dev material.

## Node equivalent of mkdocs
No built-in. Closest: VitePress (lightest), Docusaurus (heavy). Decision (scope Q2): none, plain `docs/*.md`, served by MCP.

## Open risk
`/mcp` is public and unauthenticated. Internals docs describe code layout and the upstream integration, not secrets. Same exposure class as public `/api-docs`. Docs must never contain keys, hostnames beyond what README already shows, or stored data.

## README gaps
Endpoint list stale-prone (duplicate of swagger). Moving it out per scope Q3.
