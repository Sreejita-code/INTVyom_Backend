# Plan — 2026-10-20-feature-upstream-1-6-0-sync

Follows audit `2026-10-20-audit-upstream-1-6-0-drift` (findings Q-001 to Q-013).

**Goal:** make the proxy accept and validate exactly what upstream 1.6.0 accepts for modes, models and TTS settings, without locking users out of stored assistants.

## Owner decisions (recorded 2026-10-20)

1. ElevenLabs per-model `voice_settings` rules and the Sarvam bulbul:v4-flash rules (including the 224-speaker roster) are mirrored locally, strict.
2. A TTS/STT-only edit on a duplex or realtime assistant keeps its current mode (no inference of `pipeline`).
3. Stored `gpt-5.1` / `gpt-5.4-nano` rows: reject when sent, never block unrelated edits, migration script provided.

## Steps (one at a time, `npm test` green after each)

- [x] 1. `assistant.rules.js`: add `hasSpeechPipeline(mode)`; accept `duplex` in `normalizeMode`; `inferTargetModeForUpdate` keeps realtime/duplex mode on TTS/STT-only edits; `assertTtsPairProvidedForMode` and the update TTS checks use the helper. Update `assistant.service.js` and `assistant.update.js` branches. Mongoose `llm_mode` enum, wizard allowed values and conditions.
- [x] 2. Duplex rules in `assistant.validation.js`: compatibility rows (provider `openai` only), model `gpt-live-1`, voices beacon/cedar/cinder/marin/stone/vesper, `backend_model` in the reasoning list, `backend_instructions` at most 4000 chars, refusals as 400 (enabled `assistant_greeting_audio`, `filler_words: true`, `temperature`), knobs checked against `backend_model`.
- [x] 3. `assistant.update.js`: mirror merges `assistant_llm_config` key by key (null deletes a key), replaces it when leaving realtime or crossing duplex (Q-006); missing local row returns 404 instead of TypeError (Q-007).
- [x] 4. Model lists: add `gpt-realtime-2.1`, `gpt-realtime-2.1-mini`, `gpt-6-luna`, `gpt-6-sol` (reasoning family); remove `gpt-5.1`, `gpt-5.4-nano`. Stored-row repair: allowlist check on the merged row only when the request touches `assistant_llm_config` or `assistant_mode`.
- [x] 5. New `src/assistant/tts-rules.js`: ElevenLabs models (+ `eleven_v4`, `eleven_v4_turbo`) and per-model `voice_settings` matrix; Sarvam `model` (bulbul:v3 | bulbul:v4-flash), v4-flash 224-speaker roster, pace/sample-rate/temperature limits, IN22 codes only on v4-flash. Replace the Sarvam and ElevenLabs asserts in rules and validation with it; update callers.
- [x] 6. Scripts: extend `scripts/audit-assistant-models.js`; add a one-time migration (upstream PATCH first, then mirror; gpt-5.1 to gpt-6-sol, gpt-5.4-nano to gpt-6-luna, also duplex `backend_model`; dry run by default). Record it in the README "Applied migrations" table; delete the script after it has run, per AGENTS.md.
- [x] 7. Docs: `swagger.yaml` (mode enums, model lists, duplex fields, ElevenLabs enum, Sarvam), `README.md` (same, plus data model table), yamljs load check.
- [x] 8. Tests: duplex create/update/refusals, mode inference, mirror merge, missing-row 404, repair path, new model ids, ElevenLabs matrix, Sarvam v3 vs v4-flash. Existing tests updated only where the contract changed, each with a comment.

## Not doing

Security changes (incl. the `user_id` scoping of the update lookup). New endpoints. Live OpenAI probing (upstream does it). A duplex template and wizard UX beyond allowing the mode (Q-013 optional; say if wanted). Deleting any existing test.

## Risks

Strict mirrors drift from upstream again: mitigated by one data module (`tts-rules.js`) with the source page cited in its header. Migration touches upstream: dry run first, upstream before local. Rollback: revert the commit; the migration is idempotent and only moves retired ids forward.

## Verification

`npm test`; `node --check` on changed files; `node scripts/check-assistant-payload.js`; `node src/integration/providers.js`; `node -e "require('yamljs').load('swagger.yaml')"`.
