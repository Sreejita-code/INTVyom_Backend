# INTVyom Backend

Express + MongoDB backend for INTVyom voice assistant operations.

This service:
- Manages local user and resource records in MongoDB.
- Proxies most assistant-related operations to the external Vyom API.
- Exposes module-based REST endpoints under `/api/*`.

## Tech Stack

- Node.js (CommonJS)
- Express
- Mongoose
- Axios
- Docker / Docker Compose

## Prerequisites

- Node.js 20+
- npm
- MongoDB URI (Atlas or self-hosted)
- Optional: Docker and Docker Compose

## Environment Variables

Create `.env` in the project root (already ignored by git):

```env
PORT=3000
MONGO_URI=mongodb+srv://<username>:<password>@<cluster-url>/intvyom?retryWrites=true&w=majority
```

Notes:
- Runtime code directly reads only `PORT`, `MONGO_URI` and the optional `EXTERNAL_API_BASE`
  (the LiveKit Agents host; defaults to production when unset).
- Provider keys (TTS: `sarvam`/`cartesia`/`elevenlabs`/`mistral`, STT: `sarvam`, LLM: `openai`/`gemini`) are stored through integration APIs, not read from process env.
- `src/modules/integration/providers.js` is the single source of truth for which `service_name` row holds which key. Adding a provider means one entry there, not a grep across modules. Run `node src/modules/integration/providers.js` for its self-check.
- Assistant payload rules (TTS/STT pairing, mode inference, field whitelist) have their own
  self-check: `node scripts/check-assistant-payload.js`. No DB or network needed.

## Run Locally

```bash
npm install
npm start
```

Server starts on `http://localhost:3000` by default.

## Run With Docker Compose

```bash
docker compose build --no-cache api
docker compose up -d
docker compose ps
docker compose logs -f api
```

Stop:

```bash
docker compose down
```

If your machine uses legacy Compose, replace `docker compose` with `docker-compose`.

## Deployment Script

`deploy.sh` performs:
1. `.env` existence check
2. `git pull origin main`
3. `docker compose up -d --build`
4. `docker system prune -a -f`

Run:

```bash
chmod +x deploy.sh
./deploy.sh
```

Note: `docker system prune -a -f` removes unused images and caches across Docker.

## API Base URL

All routes are mounted under:

```text
/api
```

## API Endpoints

Most endpoints require `user_id` in either query params or request body.

### Auth (`/api/auth`)

- `POST /signup` - Register user and attempt external key creation.
- `GET /get_api?user_name=...` - Fetch stored API key by username.
- `POST /login` - Login with `user_name` and `password`.

### Assistant (`/api/assistant`)

- `POST /create` - Create assistant.
- `GET /list?user_id=...` - List assistants.
- `GET /details/:id?user_id=...` - Assistant details.
- `PATCH /update/:id` - Update assistant (`user_id` in body).
- `DELETE /delete/:id` - Delete assistant (`user_id` in query/body).
- `GET /call-logs/:id?user_id=...` - Assistant call logs.

Additional fields for create/update:
- `assistant_greeting_audio`: Object `{ "enabled": bool, "audio_id": string }`. When enabled and `interaction_config.speaks_first=true`, plays the prerecorded clip instead of a model-generated greeting.

Mode-aware fields for create/update:
- `assistant_mode`: `pipeline` (default), `realtime`, or `cascade`.
- `assistant_llm_config`: LLM config object. Forwarded in **all** modes. In `cascade` mode the
  provider must be `openai` and `model` is a free-form chat model (default `gpt-4.1`).
- `assistant_tts_model` and `assistant_tts_config`: TTS fields (used when mode is `pipeline` or
  `cascade`).
- `assistant_stt_model` and `assistant_stt_config`: STT fields. `sarvam` (default) or `native`
  in pipeline; `sarvam` or `cartesia` in cascade (`native` rejected); ignored in realtime.

The retired `assistant_llm_mode` alias is rejected with `400` — use `assistant_mode`. Old
clients still sending it fail loudly instead of silently creating an assistant in the wrong mode.

Only known `assistant_*` fields are forwarded — the list is `ASSISTANT_FIELDS` in
`assistant.service.js`. A typo or a retired key (e.g. `interaction_config.user_stt_provider`) is
dropped rather than passed on for the external API to reject with `422`. Legacy local docs
carrying `interaction_config.user_stt_provider` / `.stt_api_key` (or `stt_model: "openai"`) are
fixed by `node scripts/migrate-stt-config.js`.

Language fields, three of them, easy to confuse:
- `assistant_tts_config.target_language_code` — **single string** (BCP-47). Sarvam TTS only.
- `assistant_stt_config.language` — **single string** (BCP-47, or `unknown` to auto-detect).
- `assistant_interaction_config.preferred_languages` — **array of strings**, e.g.
  `["hi-IN", "en-US"]`. The only list-valued one. Hints the STT model for multilingual or
  code-switched speakers; `[]` reverts to auto-detection.

Update semantics (mirrors the external API's validation rules):
- Mode only changes on an explicit `assistant_mode`, or when TTS/STT fields are present.
  Sending `assistant_llm_config` on its own is legal in pipeline mode (rotate `api_key`, pick
  `gemini`) and leaves the stored TTS/STT config alone.
- TTS goes out as a `model` + `config` pair; either half is enough, the other is filled in from
  the stored assistant. Switching TTS/STT provider without a new config resets to that
  provider's defaults rather than carrying the old provider's fields over.
- Switching to `cascade`: STT must not be `native` (send `sarvam`/`cartesia` in the same
  request) and `assistant_llm_config.provider` must be `openai` or omitted.

LLM provider (`assistant_llm_config.provider`):
- Vendor selector, `openai` or `gemini`. Honored in pipeline and realtime modes. In `cascade`
  mode only `openai` is valid — `gemini` returns `400`.
- Top-down persistent setting: stored on the assistant (`llm_provider`), defaults to `openai`.
- **Consistent across a mode switch** — switching `pipeline`↔`realtime` without re-sending
  `provider` keeps the previously stored vendor. Only the vendor persists; `model`/`voice`
  use each mode's vendor default.
- To change vendor, send `assistant_llm_config.provider` on create or update.

LLM API key resolution:
1. `assistant_llm_config.api_key` from the request (per-assistant override), else
2. Integration key with `service_name` = the provider (`openai` / `gemini`), else
3. In **pipeline** mode the field is omitted and the external API uses its own system key — a
   missing integration is not an error. In **realtime** mode a key is mandatory:
   `400 Integration required`.

TTS API key resolution (pipeline only):
1. Integration key with `service_name` = the TTS model (`sarvam` / `cartesia` / `elevenlabs` / `mistral`), else
2. `400 Integration required`. Any `api_key` in `assistant_tts_config` is **overwritten** — there is
   no per-assistant override for TTS.

STT API key resolution (pipeline and cascade):
1. Integration key `sarvam` — the same row the TTS slot uses, since Sarvam issues one key for
   both directions, else
2. `cartesia` (`cascade` mode only) resolves the `cartesia` integration row — also shared with
   the TTS slot, else
3. `400 Integration required`. As with TTS, any `api_key` in `assistant_stt_config` is overwritten.
4. `assistant_stt_model: "native"` (pipeline only) needs no key at all; its config is forwarded verbatim.

One provider, one row. The map of model → `service_name` lives in
`src/modules/integration/providers.js`; `POST /api/integration/store` rejects any
`service_name` outside it with `400`.

Other behavior:
- `assistant_interaction_config.filler_words` is always forced to `false` in realtime mode.
- Pipeline-only TTS fields are ignored/stripped when sending realtime updates.
- `cascade` mode: STT must be `sarvam` or `cartesia`, LLM provider must be `openai`.

### Models & Providers (reference)

Realtime LLM defaults — `provider`: `gemini` (realtime) / `openai` (pipeline);
`model`: `gemini-3.1-flash-live-preview` / `gpt-realtime-1.5`; `voice`: `Puck` / `marin`
(voice honored in realtime only).

Cascade LLM — `provider` `openai` only, `model` free-form (default `gpt-4.1`). Known-good:
`gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`, `gpt-4o`, `gpt-4o-mini`, `gpt-5`, `gpt-5-mini`,
`gpt-5-nano`, `gpt-5.1`, `gpt-5.2`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.4-nano`, `gpt-5.5`,
`chatgpt-4o-latest`.

STT — `sarvam` (pipeline default + cascade): `model` `saaras:v3` (also `saaras:v2.5`,
`saarika:v2.5`), `language` `unknown` auto-detect (24 `-IN` codes), `mode` `codemix` (only
honored in cascade). `cartesia` (cascade only): `model` `ink-whisper` (43 languages) / `ink-2`
(English only), fixed `language`. `native` (pipeline only): the realtime LLM transcribes itself.

TTS — the synthesis model is fixed per provider and not configurable: `cartesia` `sonic-3`
(`voice_id`), `sarvam` `bulbul:v3` (`speaker`), `elevenlabs` `eleven_v3` (`voice_id`),
`mistral` `voxtral-mini-tts-2603` (`voice_id`).

### End-Call Webhook Payload

`assistant_end_call_url` (AI calls) and `passthrough_webhook_url` (passthrough calls) receive a
POST with the full call record on every terminal outcome (`completed`, `busy`, `no_answer`,
`rejected`, `cancelled`, `unreachable`, `timeout`, `failed`).

- `data.queue_id` correlates with the `POST /call/outbound` response (outbound only; `null`
  for inbound/web).
- `data.call_end_reason`: `natural` | `max_duration_exceeded` (may be `null` on legacy records).
- `data.usage.mode`: `pipeline` | `realtime` | `cascade`. **Breaking:** the old
  `usage.llm_mode` key is no longer emitted — read `usage.mode`.
- `data.usage.stt_provider` / `stt_model` / `stt_audio_duration` are populated **only** in
  `cascade` mode; `null`/`0` otherwise (the LLM transcribes internally).
- `data.billable_duration_minutes`: rounded up for connected calls, `0` for non-connected
  outcomes. Clients should not recompute it.
- Passthrough webhooks: `assistant_id`/`assistant_name` are `null`, `transcripts` is `[]`, and
  there is no `usage` object.
- Statuses: `initiated`/`answered`/`completed` are lifecycle; `busy`, `no_answer`, `rejected`,
  `cancelled`, `unreachable`, `timeout`, `failed` are terminal SIP outcomes. `sip_status_code`
  / `sip_status_text` carry the SIP-level detail when available.

### SIP (`/api/sip`)

- `POST /create-outbound-trunk` - Create SIP trunk. Pass `passthrough_mode: true` to create a passthrough-only trunk. Optionally pass `passthrough_webhook_url` to receive end-of-call notifications.
- `GET /list?user_id=...` - List SIP trunks.
- `GET /details/:id?user_id=...` - SIP trunk details.
- `DELETE /delete/:id` - Delete SIP trunk (`user_id` in query/body).

### Call (`/api/call`)

- `POST /outbound` - Trigger outbound call.

### Integration (`/api/integration`)

- `POST /store` - Store or update provider API key. Body: `user_id`, `service_name`, `api_key`;
  `service_type` is optional and derived from `service_name` when omitted. A `service_name`
  the provider map doesn't know returns `400`. Returns immediately; a background re-sync
  (below) starts automatically. Response includes `resync: { job_id, status: "running" }`.
- `GET /get?user_id=...&service_name=...` - Retrieve provider API key.
- `GET /resync-status?user_id=...&service_name=...` - Current re-sync job:
  `{ status, total, processed, succeeded, failed[], updatedAt }`. `status` is
  `running | completed | error | interrupted` (`interrupted` = a running job that stalled, e.g.
  a process restart — safe to re-trigger).
- `POST /resync` - Manually (re-)trigger the re-sync for one provider. Body: `user_id`,
  `service_name`. Returns `202` with `{ resync: { job_id, status } }`. This backs the frontend
  "Re-sync" button and retries failures.

**Key rotation re-sync.** A provider key is baked into each assistant on the external side at
create/update time, so rotating a key would otherwise leave old assistants on the dead key. When
you `POST /store` a new/rotated key, a **background job** re-pushes the new key to every existing
assistant that uses that provider — LLM keys (`openai`/`gemini`) match by `llm_provider`, TTS keys
(`sarvam`/`cartesia`/`elevenlabs`/`mistral`) match by `tts_model`, and the `sarvam` key also
matches by `stt_model`. A shared key covers every slot it backs: rotating `sarvam` re-pushes
**both** the TTS and the STT config, in one request per assistant. Assistants created with their own per-request
`assistant_llm_config.api_key` / `assistant_tts_config.api_key` are left untouched.

Frontend flow: after `POST /store` (or `POST /resync`), poll `GET /resync-status` every ~2s until
`status !== "running"`; show `processed / total` progress, then `succeeded` and the `failed[]`
list. Re-store the key or call `POST /resync` to retry failures.

**One-time backfill (run once after deploy):** legacy assistants created before the `llm_provider`
field existed are not matched by the LLM re-sync query. Backfill them:

```bash
node scripts/backfill-llm-provider.js
```

Idempotent, local-DB only (sets `llm_provider` from the stored `llm_config.provider`, else `openai`).

**One-time TTS field rename (run once, before deploy):** the assistant's TTS fields are stored as
`tts_model` / `tts_config`, matching `stt_model` / `stt_config`. They used to be `model` / `config`.
The re-sync query matches on `tts_model`, so legacy documents stay invisible to it until renamed:

```bash
node scripts/migrate-tts-field-names.js
```

Idempotent, local-DB only. **Breaking for API consumers** — the `Assistant` response object (and
`local_data` on update) now carries `tts_model` / `tts_config` instead of `model` / `config`.

**One-time `sarvam_stt` cleanup (run once after deploy):** STT now reads the ordinary `sarvam`
row, so `sarvam_stt` is gone from the provider map. Any leftover row is unreachable, and its
re-sync job would keep appearing in `GET /resync-status` for a provider that no longer exists:

```bash
node scripts/drop-sarvam-stt-rows.js
```

Idempotent, local-DB only. Expect a count of `0` unless a `sarvam_stt` row was created by hand —
the frontend never offered it. Storing that name now returns `400`.

### Tool (`/api/tool`)

- `POST /create` - Create tool.
- `GET /list?user_id=...` - List tools.
- `GET /details/:id?user_id=...` - Tool details.
- `PATCH /update/:id` - Update tool (`user_id` in body).
- `DELETE /delete/:id` - Delete tool (`user_id` in query/body).
- `POST /attach/:assistant_id` - Attach tools to assistant.
- `POST /detach/:assistant_id` - Detach tools from assistant.

### Web Call (`/api/web-call`)

- `POST /get-token` - Generate web call token (AI agent call). Body: `user_id`, `assistant_id`, `metadata?`.

### Passthrough Call (`/api/passthrough-call`)

Human web-to-SIP calls with no AI agent. Web browser speaks directly to phone caller over SIP — no STT, LLM, or TTS involved.

Prerequisites: a SIP trunk created with `passthrough_mode: true`.

- `POST /passthrough-outbound` - Trigger passthrough call. Body: `user_id`, `trunk_id`, `to_number`, `metadata?`. Returns `room_token` (use with LiveKit JS/React SDK to connect browser), `room_name`, `queue_id`, `status`.
- `GET /call-records?user_id=...` - List passthrough call records. Optional filters: `to_number`, `call_status`, `start_date`, `end_date`, `limit`, `offset`.

### Inbound (`/api/inbound`)

- `POST /assign` - Assign inbound number.
- `GET /list?user_id=...` - List inbound mappings.
- `PATCH /update/:id` - Update inbound mapping (`user_id` in body).
- `POST /detach/:id` - Detach inbound mapping (`user_id` in query/body).
- `DELETE /delete/:id` - Delete inbound mapping (`user_id` in query/body).

### Inbound Context Strategy (`/api/inbound-context-strategy`)

- `POST /create` - Create strategy.
- `GET /list?user_id=...` - List strategies.
- `GET /details/:id?user_id=...` - Strategy details.
- `PATCH /update/:id` - Update strategy (`user_id` in body).
- `DELETE /delete/:id` - Delete strategy (`user_id` in query/body).

### Analytics (`/api/analytics`)

Authentication:
- Uses `user_id` query parameter
- Does not require `Authorization` header

Endpoints:
- `GET /dashboard?user_id=...` - Summary totals and period counts.
- `GET /calls/by-assistant?user_id=...` - Call metrics grouped by assistant.
- `GET /calls/by-phone-number?user_id=...` - Call metrics grouped by destination number.
- `GET /calls/by-time?user_id=...` - Time-series metrics (`granularity=day|week|month`).
- `GET /calls/by-service?user_id=...` - Call metrics grouped by service.

Supported query params:
- Common: `start_date`, `end_date`
- By phone number: `assistant_id`
- By time: `assistant_id`, `granularity`

Example:

```bash
curl -X GET "http://localhost:3000/api/analytics/dashboard?user_id=YOUR_USER_ID&start_date=2026-03-01T00:00:00Z&end_date=2026-03-28T23:59:59Z"
```

## ID Usage Notes

For several modules (assistant, sip, tool, inbound, strategy), APIs accept either:
- Local MongoDB `_id`
- External service IDs stored in local records

## Project Structure

```text
INTVyom_Backend/
├── README.md
├── package.json
├── Dockerfile
├── docker-compose.yml
├── deploy.sh
├── .env.example
└── src/
    ├── app.js
    ├── config/
    │   └── db.js
    └── modules/
        ├── analytics/
        │   ├── analytics.controller.js
        │   ├── analytics.routes.js
        │   └── analytics.service.js
        ├── auth/
        │   ├── auth.controller.js
        │   ├── auth.routes.js
        │   ├── auth.service.js
        │   └── user.model.js
        ├── assistant/
        │   ├── assistant.controller.js
        │   ├── assistant.model.js
        │   ├── assistant.routes.js
        │   └── assistant.service.js
        ├── call/
        │   ├── call.controller.js
        │   ├── call.routes.js
        │   └── call.service.js
        ├── inbound/
        │   ├── inbound.controller.js
        │   ├── inbound.model.js
        │   ├── inbound.routes.js
        │   └── inbound.service.js
        ├── inbound-context-strategy/
        │   ├── inbound-context-strategy.controller.js
        │   ├── inbound-context-strategy.model.js
        │   ├── inbound-context-strategy.routes.js
        │   └── inbound-context-strategy.service.js
        ├── integration/
        │   ├── integration.controller.js
        │   ├── integration.model.js
        │   ├── integration.routes.js
        │   └── integration.service.js
        ├── shared/
        │   └── remote.js          # callExternal, getUserWithKey, findByLocalOrExternalId (used by all modules)
        ├── sip/
        │   ├── sip.controller.js
        │   ├── sip.model.js
        │   ├── sip.routes.js
        │   └── sip.service.js
        ├── tool/
        │   ├── tool.controller.js
        │   ├── tool.model.js
        │   ├── tool.routes.js
        │   └── tool.service.js
        ├── webcall/
        │   ├── webcall.controller.js
        │   ├── webcall.routes.js
        │   └── webcall.service.js
        └── passthrough_call/
            ├── passthrough.controller.js
            ├── passthrough.routes.js
            └── passthrough.sevice.js
```

## Scripts

- `npm start` - Start API server.
- `npm test` - Placeholder script (currently exits with error by design).
