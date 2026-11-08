# Plan — standalone STT/TTS/LLM proxy endpoints

## Goal
Add proxy support in this backend for upstream standalone `POST /stt/transcribe`, `POST /tts/synthesize`, and `POST /llm/chat`, with auth, validation, safe forwarding (including multipart and streaming), swagger/docs updates, and tests.

## Source of truth
- MCP `api-livekit-docs`: `api/stt.md`, `api/tts.md`, `api/llm.md` (read 2026-11-08). Upstream paths/fields/errors/streaming behavior come from these pages, not memory.
- Existing proxy patterns: `src/server.js`, `src/api/routes/*.routes.js`, `src/services/livekit/livekitService.js`, `src/audio/*` (multipart), `src/call/*` (assistant/trunk resolution), `src/core/middleware/*`.

## Agreed scope
See `scope.md` (recommended defaults accepted, process A). Target expanded to include LLM.

## Design

### Routing / mounting
- Add routers: `src/api/routes/stt.routes.js`, `src/api/routes/tts.routes.js`, `src/api/routes/llm.routes.js`.
- Mount in `src/server.js`: `app.use('/api/stt', sttRoutes)`, `app.use('/api/tts', ttsRoutes)`, `app.use('/api/llm', llmRoutes)` (behind existing `app.use('/api', requireAuth)`).
- Exposed paths: `POST /api/stt/transcribe`, `POST /api/tts/synthesize`, `POST /api/llm/chat`.

### Service layer (axios confined to `src/services/`)
- Add domains/services: `src/stt/stt.service.js`, `src/tts/tts.service.js`, `src/llm/llm.service.js` (or a small `src/standalone/*` domain — plan prefers separate domains matching route groups; final placement recorded in progress). Each uses `getUserWithKey(req.user._id)` and resolves optional `assistant_id` via `findByLocalOrExternalId(Assistant, assistant_id, user._id, 'external_assistant_id')`, forwarding `assistant.external_assistant_id`.
- **JSON/non-streaming:** reuse `callExternal` where response is normal JSON (LLM `stream=false`).
- **Streaming/raw:** add a focused helper in `src/services/livekit/livekitService.js`, e.g. `callExternalRaw(apiKey, { path, method, data, headers, responseType:'stream', fallback, networkFallback })`, returning the axios response (or `{status, headers, data}`) so routes can `res.status(...); copy selected headers; stream.pipe(res)`. This keeps axios confined to services while allowing binary/SSE passthrough. Implementation detail: use `validateStatus: () => true` to receive upstream error streams/responses, then decide pass-through strategy.
- **Pass-through strategy for streaming (fidelity-first):** for TTS `response_format=audio` and LLM `stream=true`, copy upstream status and content/usage headers and pipe body stream to client. For non-2xx with JSON body where practical, normalize to proxy `{error}` only if easy without consuming large streams; otherwise pass through upstream error body/status to preserve behavior (document). JSON endpoints continue to use central error shape.

### STT
- Route: `multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } }).single('file')` (file field name `file` per upstream).
- Validate: file required; optional provider enum (`sarvam,cartesia,deepgram,openai,elevenlabs`) if provided; pass model/language/assistant_id through after assistant resolution.
- Build `FormData` (existing pattern) with file buffer + forwarded scalar fields; include `X-Provider-API-Key` header only when client sent it.
- Forward `POST /stt/transcribe`.

### TTS
- JSON body validated with zod: `text` required 1-5000 chars; `assistant_id?`; `provider?` cartesia/sarvam/elevenlabs/mistral; `model?/voice?/language?` strings; `save_to_library?` boolean; `response_format?` `audio`|`json` default `audio`.
- Forward `X-Provider-API-Key` if present.
- `response_format=json` (or omitted treated as audio? upstream default is `audio`): follow upstream — default `audio`. JSON mode uses `callExternal` expecting JSON.
- `audio`: use streaming/raw helper, pipe binary, preserve `Content-Type`, `Content-Disposition`, `Content-Length`, `X-TTS-*` headers.

### LLM
- JSON body validated: `messages` non-empty array of `{role: enum['system','user','assistant'], content: string}`; `assistant_id?`; `provider?` openai|gemini; `model?`; `temperature?` 0-2; `max_tokens?` positive int; `stream?` boolean default false.
- `stream=false`: `callExternal` JSON.
- `stream=true`: streaming/raw helper, set/forward `Content-Type: text/event-stream` semantics as upstream provides, pipe SSE stream; disable proxy buffering headers if needed (`Cache-Control`, `X-Accel-Buffering: no`) only when safe/appropriate — verify.

### Security & hygiene
- Never log `X-Provider-API-Key`, API keys, or upstream response bodies.
- `assistant_id` scoped to authenticated user; payload/body identity ignored except as resource id resolved against `req.user`.
- No new deps.

### Swagger / docs
- `swagger.yaml`: add tag(s) `STT`, `TTS`, `LLM` or a `Standalone AI` tag (choose clear grouping; document choice), add paths `/api/stt/transcribe`, `/api/tts/synthesize`, `/api/llm/chat` with request/response schemas/examples/errors matching MCP pages and proxy auth (`bearerAuth`/existing security). Note `X-Provider-API-Key` header parameter (optional). Mark multipart for STT, binary/SSE behavior for TTS/LLM as applicable.
- `docs/UPSTREAM.md`: add standalone endpoint notes (paths, purpose, key quirks: multipart, streaming audio, SSE, optional provider key, assistant_id inheritance).
- `docs/ARCHITECTURE.md`: add route/domain/service entries if new folders/files added.
- `docs/CHANGELOG.md`: add a dated/unreleased-style entry consistent with repo style describing new proxy endpoints (non-breaking addition).
- `docs/ASSISTANT-RULES.md`: update only if these endpoints affect assistant config semantics (likely minimal/no change).
- `README.md`: no change unless setup/env changes.

## Risks / mitigations
- **Binary/SSE proxy correctness:** use service-layer streaming helper + route piping; test with mocked upstream stream/headers. Mitigation: focused tests for header passthrough and status.
- **Multer/file-size errors:** may produce MulterError; confirm central error handler maps appropriately or add local handling. Mitigation: test 413/oversize path.
- **Upstream error body on streamed requests:** may be harder to normalize. Mitigation: pass through status/headers/body for streamed responses; JSON paths normalize via existing mechanism.
- **Enum drift vs upstream:** keep provider enums aligned with MCP docs read today; keep model strings permissive.
- **`assistant_id` format ambiguity:** resolve local/external; if user expects raw upstream id not mirrored locally, current convention rejects — acceptable given repo ownership model; document.

## Files expected to change/create
- `src/server.js`
- `src/services/livekit/livekitService.js` (streaming/raw helper, additive)
- `src/api/routes/stt.routes.js` (new)
- `src/api/routes/tts.routes.js` (new)
- `src/api/routes/llm.routes.js` (new)
- `src/stt/stt.service.js` (new)
- `src/tts/tts.service.js` (new)
- `src/llm/llm.service.js` (new)
- `src/api/routes/common.js`? (only if a helper is genuinely needed)
- `tests/api/stt.routes.test.js` (new, or combined standalone tests)
- `tests/api/tts.routes.test.js` (new)
- `tests/api/llm.routes.test.js` (new)
- `swagger.yaml`
- `docs/UPSTREAM.md`
- `docs/ARCHITECTURE.md`
- `docs/CHANGELOG.md`
- `docs/ASSISTANT-RULES.md` (only if needed)
- `agent-tracking/*` for this task

## Verification
- `npm test` (full suite green)
- `node --test tests/api/stt.routes.test.js tests/api/tts.routes.test.js tests/api/llm.routes.test.js` (or actual paths created)
- `node --check` on all changed `.js` files
- `node -e "const y=require('yamljs');y.load('swagger.yaml'); console.log('ok')"`
- Manual sanity in tests: STT multipart forwarded; TTS audio headers/stream proxied; TTS json proxied; LLM json proxied; LLM stream proxied; auth required; assistant ownership 404; `X-Provider-API-Key` forwarded.

## Rollback
Revert the added routes/mounts/services/helper and doc/swagger changes. Additive feature; no data migration. If streaming helper causes regressions, keep it isolated to new endpoints.
