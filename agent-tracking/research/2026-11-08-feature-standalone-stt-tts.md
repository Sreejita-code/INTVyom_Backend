# Research — standalone STT/TTS/LLM (2026-11-08)

## Upstream contracts (api-livekit-docs MCP, read 2026-11-08)

### `POST /stt/transcribe` (`api/stt.md`)
- Multipart form-data. Auth Bearer; optional `X-Provider-API-Key`.
- `file` required (wav/mp3/ogg/webm/m4a, max 25 MB), `assistant_id?`, `provider?` sarvam/cartesia/deepgram/openai/elevenlabs default sarvam, `model?`, `language?`.
- 200: `{success,message,data:{text,language,duration_seconds,provider,model,usage{audio_duration_seconds,estimated_cost_usd,pricing_complete,provider,model}}}`.
- 401/404/413/422/502.

### `POST /tts/synthesize` (`api/tts.md`)
- JSON. Auth Bearer; optional `X-Provider-API-Key`.
- `text` required 1-5000, `assistant_id?`, `provider?` cartesia/sarvam/elevenlabs/mistral default cartesia, `model?`, `voice?`, `language?`, `save_to_library?` default false, `response_format?` `audio`|`json` default `audio`.
- `audio`: binary stream + `Content-Type`, `Content-Disposition`, `Content-Length`, `X-TTS-Characters`, `X-Audio-Duration`, `X-Estimated-Cost-USD`, `X-Pricing-Complete`, `X-Provider`, `X-Model`.
- `json`: `{success,message,data:{audio_base64,media_type,provider,model,usage{...characters_count,audio_duration_seconds,estimated_cost_usd,pricing_complete,provider,model}}}`.
- 401/404/422/502.

### `POST /llm/chat` (`api/llm.md`)
- JSON. Auth Bearer; optional `X-Provider-API-Key`.
- `messages` required `[{role: system|user|assistant, content}]`, `assistant_id?`, `provider?` openai|gemini default openai, `model?`, `temperature?` 0-2, `max_tokens?`, `stream?` default false.
- `stream=false`: `{success,message,data:{message{role,content},provider,model,usage{prompt_tokens,completion_tokens,total_tokens,estimated_cost_usd,pricing_complete,provider,model}}}`.
- `stream=true`: `text/event-stream` SSE `data: {"choices":[{"delta":{"content":"..."}}]}` ... `data: [DONE]`.
- 401/404/422/502.

## Local codebase facts

- `src/server.js`: mounts `/api/auth` public, then `app.use('/api', requireAuth)`, then domain routers. New standalone routes can mount as `/api/stt`, `/api/tts`, `/api/llm` (or a combined router) — all behind requireAuth.
- `src/services/livekit/livekitService.js`: `callExternal(apiKey,{path,method,data,params,headers,fallback,networkFallback,networkStatus,attachPayload,extractMessage})` uses axios default response parsing, returns `response.data`. On error returns wrapped Error with `status`/optional `payload`. **Not suitable for binary/TTS audio or SSE streaming** because body is consumed as data and stream semantics/headers are not preserved to client.
- `axios` confined to `src/services/`. `multer` (memory) and `form-data` already installed (`package.json`). `zod` available.
- Patterns: `src/api/routes/audio.routes.js` uses `multer({ storage: multer.memoryStorage() })` + `upload.single('file')`, builds `FormData` in `src/audio/audio.service.js`, passes `headers: form.getHeaders()` to `callExternal`. `call.routes.js` resolves `assistant_id`/`trunk_id` via `findByLocalOrExternalId` and uses `getUserWithKey`.
- Error helpers: `src/api/routes/common.js` (`httpError`, `keepStatus`, `preserveStatus`).
- `findByLocalOrExternalId(Model, id, userId, extField)` accepts local 24-hex or external id, scoped to user.

## Design implications

1. **Streaming/raw upstream responses (TTS audio, LLM SSE):** add a service-layer helper in `src/services/livekit/livekitService.js` (axios still confined there) that performs the request with `responseType: 'stream'`, `validateStatus: () => true` (or careful error handling), and returns enough for the route to pipe/copy (`status`, `headers`, `data` stream). Routes remain thin: call service helper, set status/headers, pipe stream. For upstream error statuses with stream bodies, may need to buffer small JSON error or pass through stream; plan should choose a safe approach (prefer passing through status/headers/body stream for fidelity, or detect JSON content-type on non-2xx and normalize to proxy error shape — tradeoff documented).
2. **STT multipart forwarding:** multer memoryStorage, enforce file presence; local 25MB limit can be set in multer limits (`fileSize: 25 * 1024 * 1024`) — gives 413-ish multer error; map to proxy error. Forward file buffer + form fields via `form-data`, include `X-Provider-API-Key` if present.
3. **`assistant_id` ownership:** optional; when provided, resolve via `Assistant` + `findByLocalOrExternalId(..., 'external_assistant_id')` scoped to `req.user._id`; forward `external_assistant_id` upstream. 404 if not found/owned.
4. **`X-Provider-API-Key`:** read `req.get('X-Provider-API-Key')` / `req.headers[...]`; forward only if present; never log/store.
5. **Validation:** zod schemas per endpoint matching upstream constraints (messages non-empty with role/content, text length 1-5000, provider/model enums where stable/low-risk, stream boolean, response_format enum, temperature/max_tokens bounds). Keep validation helpful but not overly strict on model strings (upstream authoritative).
6. **Tests:** `node --test` with `supertest`/`proxyquire` patterns used in repo (need to confirm existing route test style; `tests/api/assistant.create.test.js` not found, but deps include supertest/proxyquire). Add focused tests under `tests/` mirroring `src/`.

## Open questions / risks

- **Streaming error normalization:** piping upstream non-2xx stream directly preserves fidelity but may bypass central `{error}` shape for those cases. Need consistent choice (document in plan). Recommended: for TTS/LLM streaming requests, pass through upstream status/headers/body stream as-is for fidelity; for JSON paths use `callExternal`/central handling.
- **LLM SSE client disconnect / abort:** proxy should ideally not leak upstream connections; keep implementation simple first, consider abort signal if trivial.
- **Model/provider enums:** upstream allows specific sets; local enums give fast feedback but can drift. Recommended: validate known enums from docs, treat model as string pass-through.
- **Multer error handling:** global error handler may need to recognize multer `LIMIT_FILE_SIZE` (413) — verify behavior; plan includes check.
- **`assistant_id` for these endpoints:** upstream says "assistant ID to inherit..." — likely external ID; sending resolved external ID is safest.

## Baseline commands (to run during implementation)

- `npm test`
- `node --check` on changed files
- `node -e "const y=require('yamljs');y.load('swagger.yaml')"`
- targeted new tests: `node --test tests/api/standalone.routes.test.js` (planned name)
