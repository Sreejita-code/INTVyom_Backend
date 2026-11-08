# Tasks — standalone STT/TTS/LLM proxy endpoints
**Status:** approved (2026-11-08, by user)

Goal: proxy upstream standalone STT/TTS/LLM endpoints with auth, validation, streaming/multipart forwarding, docs, and tests.

## Checklist

- [x] 1. **Research/confirm patterns** — inspect test patterns, error handler/multer behavior, and finalize streaming helper contract; record in `progress.md`.
- [x] 2. **Service-layer upstream support** — add streaming/raw helper in `src/services/livekit/livekitService.js` (axios confined; additive). Keep `callExternal` unchanged for existing JSON callers.
- [x] 3. **[P] STT domain + route** — add `src/stt/stt.service.js`, `src/api/routes/stt.routes.js`; multipart (`file`), optional `assistant_id` resolution, `X-Provider-API-Key` passthrough, validation/limits, forward to `/stt/transcribe`; mount in `src/server.js`.
- [x] 4. **[P] TTS domain + route** — add `src/tts/tts.service.js`, `src/api/routes/tts.routes.js`; JSON validation, `response_format` handling (`audio` stream passthrough with headers, `json`), `assistant_id`/provider key passthrough; mount in `src/server.js`.
- [x] 5. **[P] LLM domain + route** — add `src/llm/llm.service.js`, `src/api/routes/llm.routes.js`; messages/params validation, `stream=false` JSON, `stream=true` SSE passthrough, `assistant_id`/provider key passthrough; mount in `src/server.js`.
- [x] 6. **Tests** — add `node --test` coverage under `tests/api/` for STT/TTS/LLM (auth via app wiring assumptions/mocks as appropriate, validation, assistant ownership 404, header passthrough, TTS audio header passthrough, LLM SSE passthrough, STT multipart forwarding). Use `supertest`/`proxyquire` consistent with repo deps.
- [x] 7. **Swagger** — update `swagger.yaml` with new tags/paths/schemas/examples/errors/security/header params; validate YAML parses.
- [x] 8. **Docs sync** — update `docs/UPSTREAM.md`, `docs/ARCHITECTURE.md`, `docs/CHANGELOG.md`; `docs/ASSISTANT-RULES.md` only if impacted; `README.md` only if setup/env changed. Update `agent-tracking/INDEX.md`/progress/report links as task completes.
- [x] 9. **Verification** — run targeted tests, full `npm test`, `node --check` on changed JS files, swagger parse; record exact results in `progress.md`.
- [x] 10. **Report** — write HTML report to `agent-tracking/reports/2026-11-08-feature-standalone-stt-tts.html`, summarize in chat.

## Dependencies / notes
- Steps 3–5 depend on step 2 for streaming/raw helper design where needed; implementation can be sequenced carefully (JSON paths may use `callExternal`).
- [P] marks route/domain pairs that touch different files; mount edits in `server.js` should be coordinated (single step or careful sequencing).
- Follow repo rules: no `process.env` outside config, no axios outside services, no `console.*`, no logging upstream bodies/keys, identity from `req.user`.

## Verification commands (expected)
- `node --test tests/api/stt.routes.test.js tests/api/tts.routes.test.js tests/api/llm.routes.test.js` → pass
- `npm test` → pass
- `node --check <changed files>` → no output/errors
- `node -e "const y=require('yamljs');y.load('swagger.yaml'); console.log('ok')"` → `ok`
