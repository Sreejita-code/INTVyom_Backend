# Progress — standalone STT/TTS/LLM

## 2026-11-08
- Scope agreed (recommended defaults, process A, target expanded to include LLM). Plan/tasks approved by user.
- Gate note (`core-be-implement`): no SDD `specs/` artifacts by chosen process A; plan/research reviewed, no Critical/High findings identified before implementation.
- Researched MCP contracts (`api/stt.md`, `api/tts.md`, `api/llm.md`), local proxy patterns (`callExternal`, audio multipart, route/service layering), and test patterns (`supertest` + `proxyquire`).

## Step log

1. **Patterns confirmed.** Added additive streaming helper strategy; axios remains confined to `src/services/livekit/`. Existing `callExternal` unchanged.
2. **`src/services/livekit/livekitService.js`** — added `callExternalStream(apiKey, opts)` returning `{status, headers, data}` with `responseType:'stream'`, `validateStatus: () => true`. Network failures throw wrapped errors; upstream HTTP statuses returned for fidelity/passthrough.
3. **STT** — added `src/stt/stt.service.js` and `src/api/routes/stt.routes.js`; mounted `POST /api/stt/transcribe` in `src/server.js`. Multer memory upload (`file`, 25MB), provider enum guard, extension hint, optional `assistant_id` resolved to owned external assistant id, optional `X-Provider-API-Key` forwarded. Upstream call via multipart `form-data` to `/stt/transcribe`.
4. **TTS** — added `src/tts/tts.service.js` and `src/api/routes/tts.routes.js`; mounted `POST /api/tts/synthesize`. Zod validation (`text` 1–5000, provider/format enums). `response_format=json` uses `callExternal`; `audio` (default) uses `callExternalStream` and pipes binary while forwarding `Content-*` and `X-TTS-*`/usage headers. `save_to_library` passed through.
5. **LLM** — added `src/llm/llm.service.js` and `src/api/routes/llm.routes.js`; mounted `POST /api/llm/chat`. Zod validation for `messages[]`, provider, temperature 0–2, `max_tokens`, `stream`. `stream=false` uses `callExternal`; `stream=true` uses `callExternalStream` and pipes SSE with `text/event-stream` handling (`Cache-Control`/`X-Accel-Buffering` for SSE).
6. **Tests** — added `tests/api/routes/stt.routes.test.js`, `tts.routes.test.js`, `llm.routes.test.js` (supertest + proxyquire). Cover validation, JSON paths, `X-Provider-API-Key` forwarding, STT multipart/fields, TTS audio header+body passthrough, LLM SSE passthrough.
7. **Swagger** — added `STT`, `TTS`, `LLM` tags and paths `/api/stt/transcribe`, `/api/tts/synthesize`, `/api/llm/chat` in `swagger.yaml` with auth, optional `X-Provider-API-Key` header, request/response schemas, binary/SSE responses, and error codes.
8. **Docs sync** — updated `docs/UPSTREAM.md` (standalone endpoint table/notes), `docs/ARCHITECTURE.md` (new domains + `callExternalStream` note), `docs/CHANGELOG.md` (2026-11-08 entry). `docs/ASSISTANT-RULES.md` not impacted by proxy-only additions; `README.md` unchanged (no setup/env changes).

## Verification

- `node --check` (changed source files): `src/services/livekit/livekitService.js src/stt/stt.service.js src/tts/tts.service.js src/llm/llm.service.js src/api/routes/stt.routes.js src/api/routes/tts.routes.js src/api/routes/llm.routes.js src/server.js` → `OK`
- `node --check` (new tests): `tests/api/routes/stt.routes.test.js tests/api/routes/tts.routes.test.js tests/api/routes/llm.routes.test.js` → `OK`
- `node --test tests/api/routes/stt.routes.test.js tests/api/routes/tts.routes.test.js tests/api/routes/llm.routes.test.js` → **9 tests, 9 pass, 0 fail** (after fixing zod-4 text validation message mapping and binary response assertion in TTS test)
- `node -e "const y=require('yamljs');y.load('swagger.yaml'); console.log('ok')"` → `ok`
- `npm test` → **195 tests, 195 pass, 0 fail, 0 skipped** (duration ~4.1s)

## Out-of-scope observations

- Streamed upstream non-2xx responses are passed through for fidelity in TTS audio/LLM SSE paths; JSON-mode endpoints use existing `callExternal`/central error behavior. If clients require strict `{error}` normalization for *all* streamed error bodies, that would need buffering/content-type inspection (tradeoff: memory/fidelity).
- `assistant_id` is resolved against assistants owned by the authenticated user (local/external id). A raw upstream assistant id not mirrored locally will be rejected as not found for this user, consistent with this proxy’s ownership model.
- `docs/ASSISTANT-RULES.md` unchanged (standalone endpoints inherit config upstream; no local rule changes).
