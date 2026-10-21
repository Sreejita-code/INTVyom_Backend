# Plan — fix 1.7.0 duplex usage docs

Goal: make swagger and developer docs state only what upstream 1.7.0 documents about duplex usage and `call_end_reason`.
Skills: core-be-workflow, core-be-coding-standards (docs-truth), core-be-build-feature (docs only).

## Steps
- [x] 1. `swagger.yaml:3745-3760` (`AssistantCallLog.usage` description): replace the duplex sentence with the real `model_usage` shape, pre-1.7.0 `llm_usage` trap, comma-separated `llm_model`, `pricing_schema_version` 2.
- [x] 2. `swagger.yaml:957-971` call-log example: add `model_usage` and pricing fields to the example (cascade example, one entry) so the shape is visible. Keep it small.
- [x] 3. `swagger.yaml:4669` webhook description: `call_end_reason` lists `natural`, `end_call_tool`, `silence_timeout`, `max_duration_exceeded`, may be `null` on legacy records. Add one sentence pointing at the duplex `model_usage` rule.
- [x] 4. `docs/ASSISTANT-RULES.md:236`: same four `call_end_reason` values.
- [x] 5. `docs/ASSISTANT-RULES.md:239-243`: replace the invented-keys bullet with the real shape; keep the service-tier sentence (matches upstream: `flex` x0.5, `fast`/`priority` x2, token-billed only, duplex tier scales the backend only).
- [x] 6. `docs/CHANGELOG.md:14-15`: replace the wrong "Docs:" line with a corrected one, plus a line for `call_end_reason`. No new heading (a test reads the newest `## ` heading).
- [x] 7. Verify; write progress.md; update INDEX.

## Not doing
- No code change: the proxy forwards usage unchanged and needs none.
- No README change: no endpoint, env, script or structure change.
- No local type validation of `model_usage[].type`: nothing branches on it.
- No new tests: docs only; existing swagger/MCP tests cover load and heading.

## Risks and rollback
- Docs wording wrong again: every sentence is taken from upstream `webhook.md`, `usage-accounting.md`, `logs.md` read this session; no field not on those pages.
- Rollback: `git checkout -- swagger.yaml docs/ASSISTANT-RULES.md docs/CHANGELOG.md` (files are clean in git now).

## Verification
- `npm test` all green.
- `node -e "const y=require('yamljs');y.load('swagger.yaml')"` loads.
- `grep -rnE "estimated_cost_voice|estimated_cost_backend" swagger.yaml docs` returns nothing; `grep voice_model` returns nothing outside `backend_model` config.
