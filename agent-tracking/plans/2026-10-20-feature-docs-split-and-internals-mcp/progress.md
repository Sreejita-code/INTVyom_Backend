# Progress — 2026-10-20-feature-docs-split-and-internals-mcp

- Plan approved by user ("approve"). Loaded core-be-coding-standards.
- Step 1 done: `src/mcp/dev-docs.js` + `tests/mcp/dev-docs.test.js` (4 tests, pass).
- Step 2 done: three tools registered in `src/mcp/swagger-mcp.js`, INSTRUCTIONS extended, tools/list test now eight, new e2e test for dev-doc tools (passes after step 3 creates docs/).

## Out-of-scope observations
- Step 3 done: docs/ASSISTANT-RULES.md (moved from README: update semantics, key resolution, model allowlists, end-call webhook; extra file beyond plan, so no README content is lost), ARCHITECTURE.md (tree, layers, billable-minutes note, moved from README), DATA.md (moved), UPSTREAM.md (verified against livekitService.js, auth.service.js, userAccess.js, assistant.service.js, assistant.resync.js, grep of upstream paths), DEVELOPING.md, CHANGELOG.md (seeded from git log + README breaking notes).
- Step 4 done: tests/mcp/architecture.test.js.
- Step 5 done: README 781 -> 174 lines (run-only + Documentation + MCP section). Endpoint list dropped (duplicate of swagger). Response envelope moved to docs/ARCHITECTURE.md.
- Step 6 done: swagger.yaml info "For agents" paragraph, Dockerfile `COPY docs ./docs`, AGENTS.md repo-owned sections (docs/ row, README/docs roles, structure pointer). Pack block untouched.
- `npm test`: 181 pass, 0 fail. yamljs load ok.

## Out-of-scope observations
- `src/services/livekit/livekitService.js:12` `https.Agent({ rejectUnauthorized: false })`: upstream TLS cert never verified while every call carries a user API key. MITM can read keys. Fix: enable verification (needs valid chain upstream or a CA bundle). Documented in docs/UPSTREAM.md "Known trap".
- `src/assistant/assistant.service.js` deleteAssistant: `Assistant.findOneAndDelete({ external_assistant_id })` has no `user_id` filter. Upstream delete runs first with the caller's key so a non-owner is rejected earlier; still, scope the local delete by user (defence in depth).
- Step 7 done: reviewer subagent findings applied (dev-docs.js read inside try, name max(100), doc claim fixes, lost README content moved to CHANGELOG/ASSISTANT-RULES, stronger tests); docs restructured per user's "production graded" request (ARCHITECTURE layers table, ASSISTANT-RULES heading hierarchy). Report written. 181/181 tests.
- Not applied: changelog fence-aware split (no fences today, noted in report); tool.service unscoped writes and TLS flag (out of scope, reported).
