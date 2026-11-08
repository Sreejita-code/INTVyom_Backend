# Scope — standalone STT/TTS proxy endpoints

## Original request (verbatim)

> @core-be-plan  ->  In that MCP there is a new thing for standalone STT/TTS and under them there are new features that have been added and new endpoints. I wanted to take a look, add those things here, and properly update everything using the skills, the docs, and everything.

## What the MCP shows (evidence, read 2026-11-08)

- `api/stt.md`: `POST /stt/transcribe` (multipart/form-data, Bearer auth, optional `X-Provider-API-Key`). Fields: `file` (required, wav/mp3/ogg/webm/m4a, max 25 MB), `assistant_id`, `provider` (sarvam/cartesia/deepgram/openai/elevenlabs, default sarvam), `model`, `language`. Returns `{success,message,data:{text,language,duration_seconds,provider,model,usage{audio_duration_seconds,estimated_cost_usd,pricing_complete,provider,model}}}`. Errors 401/404/413/422/502.
- `api/tts.md`: `POST /tts/synthesize` (JSON, Bearer auth, optional `X-Provider-API-Key`). Fields: `text` (required, 1-5000 chars), `assistant_id`, `provider` (cartesia/sarvam/elevenlabs/mistral, default cartesia), `model`, `voice`, `language`, `save_to_library` (default false), `response_format` (`audio` default binary stream | `json` base64). `audio` response: binary + headers `Content-Type`, `Content-Disposition`, `Content-Length`, `X-TTS-Characters`, `X-Audio-Duration`, `X-Estimated-Cost-USD`, `X-Pricing-Complete`, `X-Provider`, `X-Model`. `json` response includes `audio_base64`, `media_type`, `provider`, `model`, `usage{characters_count,audio_duration_seconds,estimated_cost_usd,pricing_complete,provider,model}`. Errors 401/404/422/502.
- `changelog.md`: current release is 1.7.0 (2026-10-21). No explicit changelog entry was found for standalone STT/TTS in the pages read; the endpoint pages are present in the MCP TOC.

## Current backend state (evidence)

- No `/stt` or `/tts` routes/services under `src/` (only `src/assistant/tts-rules.js` exists). No swagger paths for `/stt` or `/tts`. `src/server.js` mounts domain routes under `/api/*` behind `requireAuth`.
- Upstream calls go through `src/services/livekit/livekitService.js` (`callExternal`, axios confined there). `express.json()` is global; STT needs multipart upload (no multipart middleware present).

## Agreed scope

| Item | Answer |
|------|--------|
| Target | Add proxy support for **three** upstream standalone endpoints (user clarified: LLM too): `POST /stt/transcribe`, `POST /tts/synthesize`, `POST /llm/chat`. Mount under `/api` convention: `POST /api/stt/transcribe`, `POST /api/tts/synthesize`, `POST /api/llm/chat`, forwarding to upstream paths `/stt/transcribe`, `/tts/synthesize`, `/llm/chat`. |
| Depth | standard (recommended, accepted) |
| Out of scope | No local audio-library persistence changes beyond upstream `save_to_library` pass-through; no pricing/usage storage; no frontend; no new deps unless absolutely necessary (existing `multer`/`form-data`/`axios`/`zod` expected sufficient). |
| Constraints | No new deps preferred; no API breaks for existing clients; no git side effects; axios confined to `src/services/`; handlers thin/delegate, `next(err)`/central error shape; never log upstream response bodies/keys. |
| Success criteria | All 3 endpoints proxied with auth, request validation, `assistant_id` ownership handled per repo convention, `X-Provider-API-Key` pass-through (not logged/stored), STT multipart upload forwarded (25MB/type guard as local sanity + upstream authoritative), TTS `audio` streams binary with upstream headers preserved + `json` mode proxied, LLM non-stream + SSE `stream:true` proxied appropriately; swagger/docs updated; `npm test` green; `node --check` on changed files; swagger YAML parses. |
| Output | HTML report in `agent-tracking/reports/` (recommended, accepted) |
| Process | **A)** Established agent-tracking workflow (scope → plan in `agent-tracking/plans/.../plan.md` + tasks → explicit approval → implement). No `specs/` SDD artifacts created. |

## Clarification log

| When | Question | Answer |
|------|----------|--------|
| 2026-11-08 | Initial scope interview posted (defaults 1-9, A/B). | User: "Approved with recommended. One thing: it is not only TTS and LLM or TTS/STT; there is LLM also. There are three new endpoints for standalone TTS, STT, and LLM so add those also." — treated as: recommended defaults accepted, process A, target expanded to include `POST /llm/chat`. |

## Assumptions (state now; user can correct)

- `assistant_id` (optional) will accept local Mongo `_id` or `external_assistant_id` and resolve to the owned assistant’s external id for upstream, matching repo dual-ID convention. If not found/owned → 404.
- STT: `multer` memory upload, single `file` field; local guard for presence/size (~25MB)/basic mime/ext hints, then forward upstream multipart; upstream remains authoritative for 413/422 details.
- TTS: `response_format=audio` proxied as streaming/binary passthrough preserving status and relevant headers (`Content-*`, `X-TTS-*`, `Content-Disposition`); `response_format=json` returns upstream JSON. `save_to_library` passed through.
- LLM: `stream=false` proxied as JSON; `stream=true` proxied as SSE/stream passthrough (`text/event-stream`) preserving upstream stream semantics.
- `X-Provider-API-Key` accepted from client request header and forwarded upstream only; never persisted or logged.
- Error handling follows existing patterns (`callExternal` for JSON; a streaming/raw variant in `src/services/livekit` if needed, since axios is confined to services). Upstream statuses passed through where appropriate.
- Docs updated: `swagger.yaml`, `docs/UPSTREAM.md`, `docs/ARCHITECTURE.md`, `docs/CHANGELOG.md`, `docs/ASSISTANT-RULES.md` only if impacted; `README.md` only if run/setup/env changes (unlikely).
