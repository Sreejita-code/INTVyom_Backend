# Progress — 2026-10-20-feature-upstream-1-6-0-sync

Baseline before changes: `npm test` 145 pass, 0 fail. After: 169 pass, 0 fail. `node --check` clean on every changed file; `scripts/check-assistant-payload.js` and `src/integration/providers.js` ok; `swagger.yaml` loads with yamljs.

1. Mode helper and duplex in rules, service, update, schema enum, wizard. TTS/STT-only edits on realtime/duplex rows keep the mode (contract change from "inferred pipeline"; two existing tests and the self-check updated with comments).
2. Duplex validation (model, voices, backend_model, instructions length, greeting audio and filler refusals, knobs on backend model, temperature rejected) in assistant.validation.js; compat tables gained a duplex row.
3. Update flow: mirror merges llm_config key by key (null deletes), replaced on leaving realtime / crossing duplex; missing local row is a 404; duplex restrictions see the merged stored row.
4. Model lists: realtime 2.1 pair, gpt-6-luna/sol added; gpt-5.1 and gpt-5.4-nano removed from the allowlist and kept in the family lists so stored rows stay editable; a request naming one gets a 400 naming the replacement.
5. New src/assistant/tts-rules.js: ElevenLabs v4 and per-model voice_settings, Sarvam bulbul:v3 / v4-flash (224 speakers, limits, IN22 codes). rules.js re-exports, callers use assertTtsConfigAllowed.
6. scripts/audit-assistant-models.js made model-aware and extended; scripts/migrate-retired-models.js added (dry run default, upstream first).
7. swagger.yaml and README updated.
8. Tests added: duplex validation, update-flow cases, retired-model repair path, tts-rules.

## Out-of-scope observations

- assistant.update.js: Assistant.findOne({ external_assistant_id }) is not scoped by user_id; validation runs before the upstream ownership check (security audit was skipped by request).
- README line "data.usage.mode: pipeline | realtime | cascade" not verified against upstream usage docs for duplex.
- Not verified live: whether upstream accepts the PATCH that moves a retired model on a row still holding it (upstream docs say PATCHes to such a row are refused until it moves). The migration script relies on that PATCH being accepted.
- Left as is: wizard has no duplex template; no duplex template added.

## Docs updated

swagger.yaml (mode enums, LLM config, duplex fields, model lists, voice, Sarvam and ElevenLabs schemas, web-call text_only), README.md (mode fields, model lists, retired models, duplex, TTS rules, scripts, data-model table).

## Swagger / MCP recheck (follow-up)

Fixed: info.description (the /mcp get_overview text) listed three modes; update `assistant_mode` description was stale (TTS/STT fields no longer infer a mode); create `assistant_tts_model` said pipeline only; added duplex, ElevenLabs v4 and Sarvam v4-flash create examples, duplex and gpt-6 update examples, new 400 examples (retired model, duplex greeting, ElevenLabs setting), a 404 for update, `local_data.llm_config` merge note, AssistantLlmConfig schema example (the /mcp generator otherwise blends modes). New tests in tests/api/swagger.test.js: mode and TTS enums match the code, model description names every accepted model, documented 400 messages equal the messages the code throws, schema example is sendable. 175 tests pass. swagger info.version still 1.0.0 (not bumped; owner decision).
