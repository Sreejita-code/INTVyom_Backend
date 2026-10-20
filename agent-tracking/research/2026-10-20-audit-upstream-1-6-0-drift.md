# Research — 2026-10-20-audit-upstream-1-6-0-drift

Sources read this session from the api-livekit-docs MCP: changelog.md (1.6.0 down to 1.0.0), reference/models.md, reference/compatibility.md, concepts/assistant-modes.md, concepts/duplex.md, api/assistant/create.md, api/assistant/update.md, api/health.md, api/calls/usage.md, api/analytics/index.md, api/sip/deactivate.md.
Local files read: src/assistant/assistant.rules.js, assistant.validation.js, assistant.service.js (part), src/server.js, src/core/config.js, src/services/livekit/livekitService.js, requireAuth.js, auth.service.js (part), route lists.

## Drift against upstream 1.6.0 (leads, not yet verified file by file)

Modes: `duplex` is absent locally. `normalizeMode` and the Mongoose enum (`assistant.model.js:14`) accept only pipeline/realtime/cascade; error text at `assistant.rules.js` names three modes. COMPATIBILITY_MATRIX and PROVIDER_COMPATIBILITY in `assistant.validation.js` have no duplex row.
Duplex fields: `backend_model`, `backend_instructions`, `gpt-live-1`, voices beacon/cedar/cinder/marin/stone/vesper, refusals (enabled greeting audio, filler_words, text_only web call, temperature), clear stored llm config on switch into/out of duplex.
OpenAI models: realtime list lacks `gpt-realtime-2.1`, `gpt-realtime-2.1-mini`. Cascade list still holds retired `gpt-5.1`, `gpt-5.4-nano`, and lacks `gpt-6-luna`, `gpt-6-sol`. REASONING_MODELS, REASONING_TOOL_INCOMPATIBLE, GPT5_GENERATION in validation.js need the same edit. gpt-6 accepts reasoning_effort none/low/medium/high/xhigh but not minimal.
Stored rows: an assistant holding gpt-5.1 / gpt-5.4-nano still runs upstream but any PATCH is refused until moved (upstream 1.6.0). The proxy mirror (Mongo) needs a migration, as upstream has migrate_retired_models.py.
ElevenLabs TTS: `ELEVENLABS_TTS_MODELS` lacks `eleven_v4`, `eleven_v4_turbo`; per-model voice_settings gating (422 for ignored settings) not mirrored; `eleven_monolingual_v1`/`eleven_multilingual_v1` rejected upstream.
Sarvam TTS: `assistant_tts_config.model` (bulbul:v3 | bulbul:v4-flash) not handled. `SARVAM_SPEAKERS` is v3 only; the 224-name v4-flash roster, pace 0.5-2.0, sample rate subset, temperature rejected on v4-flash, IN22 language codes only on v4-flash are all missing. Speaker check hard-codes "bulbul:v3".
Other: `assistant_end_call_webhook` already present locally. Gemini lists already current. Deepgram/Sarvam STT lists already current.

## Endpoints in upstream docs not proxied locally (to confirm from each page)

GET /health (deep, upstream 1.6.0), GET /call/records/{room}/usage, token analytics (tokens-summary, tokens-by-model), admin/* (super-admin), activity-logs, calls/web-call variants, inbound manage, sip deactivate (local has DELETE /sip/delete), webhook payload docs. Local analytics route list has only dashboard, by-assistant, by-phone-number, by-time, by-service.

## Security leads (suspected, to verify in phase 6)

- `livekitService.js:11` `https.Agent({ rejectUnauthorized: false })`: TLS verification disabled on every upstream call that carries the Bearer key.
- `server.js` `cors()` open to all origins; no rate limiting on /api/auth/login and /signup; no helmet; no body-size limit set explicitly; `/mcp` and `/api-docs` unauthenticated by design.
- api_key stored plaintext in Mongo (`user.model.js:18`) and used as the lookup credential; masked-key echo (upstream rejects masked values with 422, proxy may forward them).
- Signup is non-fatal on key issuance failure (api_key null).
- Upstream rejects masked key values on PATCH: check the proxy does not overwrite stored keys with masked strings from GET details.

## Open questions for the user

See chat.
