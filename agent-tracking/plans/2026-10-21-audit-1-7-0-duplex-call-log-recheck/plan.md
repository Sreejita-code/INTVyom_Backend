# Review plan — 1.7.0 duplex call-log / usage recheck

Goal: decide per changelog item whether the proxy needs a change. Report only.

## Files, in order
1. `src/assistant/assistant.billing.js` (done in research: forwards unchanged, reads 3 unrelated fields)
2. `src/api/routes/assistant.routes.js:71-94`, `src/analytics/analytics.service.js`, `src/call/call.service.js`
3. `swagger.yaml` call-log `usage` example + schema description; webhook schema near line 4671-4720
4. `docs/ASSISTANT-RULES.md`, `docs/CHANGELOG.md`, `docs/UPSTREAM.md`
5. `tests/api/swagger.test.js` and any usage fixture

## Method
- Checklist: bugs, structure, docs-truth. Not AI-generated-code heavy, but the invented field names are an AI-docs smell (check 1: hallucinated API).
- Tools: `npm test`, `node -e` yamljs load of `swagger.yaml`.
- Each changelog item marked match/gap with file:line; stored-record impact stated (old rows keep `llm_usage`; `pricing_schema_version` 1 vs 2).

## Output
`agent-tracking/reports/2026-10-21-audit-1-7-0-duplex-call-log-recheck.html`, self-contained, no scripts, with a proposed doc patch.

## Not doing
- No edits to source, swagger or docs (report only).
- No fixing anything found outside usage/call-log scope.
