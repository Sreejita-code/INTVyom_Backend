# Review plan — 1.7.0 drift (report only)

Goal: for every 1.7.0 changelog item, state match / gap with file:line evidence, and what happens to stored assistants.

Steps
- [ ] Verify `GPT5_GENERATION` covers gpt-6 (`assistant.validation.js:40-70`) and flex/verbosity paths.
- [ ] Read tests for Gemini realtime knobs (`tests/assistant/validation.test.js`, `update.test.js`).
- [ ] Confirm Gemini 422 passthrough on create and update (`assistant.service.js`, `livekitService.js`).
- [ ] Check duplex rules once more against `models.md` GPT-Live table.
- [ ] Write `reports/2026-10-21-audit-upstream-1-7-0-drift.html` (no external scripts).

Not doing: source edits, docs edits, migrations. Fix is a separate task.
