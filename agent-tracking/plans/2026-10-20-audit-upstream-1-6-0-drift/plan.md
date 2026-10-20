# Plan — 2026-10-20-audit-upstream-1-6-0-drift

**Goal:** report, with file:line evidence, every place where the proxy's mode, model and validation rules differ from upstream 1.6.0, and a scoped fix plan for them.

## Steps (audit, report-only)

- [x] 1. Baseline: `npm test`, `node --check` on src/assistant/*, `node scripts/check-assistant-payload.js`, `node src/integration/providers.js`; record in research.
- [x] 2. Read remaining local files in scope in full: assistant.builder.js, assistant.update.js, assistant.billing.js, assistant.resync.js, wizard.service.js, template.service.js and the four templates, exporter.js, assistant.model.js, scripts/audit-assistant-models.js, the assistant routes, matching tests.
- [x] 3. Read the remaining upstream pages: concepts/cascade.md, api/assistant/get.md, list.md, placeholders, tts-humanization pages, reference/pricing.md, usage-accounting.md, troubleshooting.md (duplex and model sections), api/calls/web-call.md, trigger.md, passthrough.md.
- [x] 4. Review in order: bugs, structure, design, readability, tests, AI-generated-code checks, per the audit skill. Mark suspected items as suspected.
- [x] 5. Write `agent-tracking/reports/<slug>.html` (self-contained, no scripts): severity tiles, findings, current-vs-upstream tables, fix plan as scoped follow-up tasks, what was not reviewed.

## Expected findings (leads from research, to be verified)

Mode `duplex` missing (rules, validation matrix, Mongoose enum, builder, update flow, templates, wizard, swagger). Model lists stale (gpt-realtime-2.1 pair, gpt-6-luna/sol, retired gpt-5.1 / gpt-5.4-nano, eleven_v4 pair, v1 ElevenLabs rejection). Sarvam TTS `model` and v4-flash rules missing. ElevenLabs voice_settings per-model gating missing. Duplex refusals (greeting audio, filler words, text_only web call, temperature) and stored-config reset on mode switch missing. Stored-row migration for retired models.

## Recommended follow-up fix tasks (to be refined in the report)

1. `core-be-build-feature`: duplex mode end to end (schema enum, rules, validation, builder, update merge/reset, web-call text_only refusal, swagger, README, tests).
2. fix task: model allowlists and knob families (gpt-6, realtime-2.1, retired models with repair path) plus migration script, replacing scripts/audit-assistant-models.js coverage.
3. fix task: TTS rules (ElevenLabs v4 and per-model voice_settings, Sarvam model/roster/limits, IN22 codes).
4. docs sync inside each task.

## Not doing

Code changes. Security audit. New endpoints (health, usage, token analytics, admin, activity-logs). Live probing of upstream. Registering the core-be block in AGENTS.md / CLAUDE.md (repo has its own curated conventions; not touched unless you ask).

## Risks

Upstream docs may be ahead of the deployed upstream: every list is read from the MCP, not probed. Delegation: none planned; ~25 files, read directly.

## Verification

Report opened offline, every finding's file:line re-checked against the file; baseline command output attached.
