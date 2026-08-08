# INTVyom Backend

Express + MongoDB backend for INTVyom voice assistant operations.

This service:
- Manages local user and resource records in MongoDB.
- Proxies most assistant-related operations to the external Vyom API.
- Exposes module-based REST endpoints under `/api/*`.

## Response Envelope

Success responses keep their per-endpoint shape (unchanged, so existing clients keep
working) — most are `{ success, message, data }`, some proxy the upstream body verbatim.

Every failure returns the same shape, built centrally by
`src/core/middleware/errorHandler.js`:

```json
{ "error": "Assistant not found" }
```

- The status comes from `err.status` (validation `400`, upstream `4xx` passed through,
  `404` for unknown routes) and falls back to `500`.
- Analytics endpoints forward the upstream error body verbatim instead, via `err.payload`.
- Route handlers never build error bodies — they `throw` and land in the central handler.

## Tech Stack

- Node.js (CommonJS)
- Express
- Mongoose
- Axios (only inside `src/services/`)
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

Every variable the runtime reads — all of them in `src/core/config.js`, mirrored by
`.env.example`:

| Variable | Default | Note |
|---|---|---|
| `PORT` | `3000` | HTTP listen port |
| `MONGO_URI` | none (required) | MongoDB connection string |
| `EXTERNAL_API_BASE` | `https://api-livekit-vyom.indusnettechnologies.com` | LiveKit Agents host; override for staging or a local mock |

Notes:
- Provider keys (TTS: `sarvam`/`cartesia`/`elevenlabs`/`mistral`, STT: `sarvam`/`cartesia`/`deepgram`/`elevenlabs`/`openai`, LLM: `openai`/`gemini`) are stored through integration APIs, not read from process env. Several vendors share one row across slots — see [STT API key resolution](#stt-api-key-resolution).
- `src/integration/providers.js` is the single source of truth for which `service_name` row holds which key. Adding a provider means one entry there, not a grep across modules. Run `node src/integration/providers.js` for its self-check.
- Assistant payload rules (TTS/STT pairing, mode inference, field whitelist) have their own
  self-check: `node scripts/check-assistant-payload.js`. No DB or network needed.

## Run Locally

```bash
npm install
npm start          # or: npm run dev — same thing, restarts on file changes
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
- `GET /list?user_id=...` - List assistants. Optional: `page`, `limit` (defaults to 100 here,
  not the external API's 10, because existing clients expect the whole list in one call),
  `assistant_name` (case-insensitive partial match), `start_date`, `end_date`, `sort_by`,
  `sort_order`.
- `GET /details/:id?user_id=...` - Assistant details.
- `PATCH /update/:id` - Update assistant (`user_id` in body).
- `DELETE /delete/:id` - Delete assistant (`user_id` in query/body).
- `GET /call-logs/:id?user_id=...` - Assistant call logs.

Additional fields for create/update:
- `assistant_greeting_audio`: Object `{ "enabled": bool, "audio_id": string }`. When enabled and `interaction_config.speaks_first=true`, plays the prerecorded clip instead of a model-generated greeting.

Mode-aware fields for create/update:
- `assistant_mode`: `pipeline` (default), `realtime`, or `cascade`.
- `assistant_llm_config`: LLM config object. Forwarded in **all** modes. `provider` is `openai`
  in pipeline and cascade, `gemini` or `openai` in realtime. `model` is validated against a
  per-mode allowlist. Cascade adds seven generation knobs (`temperature`, `max_output_tokens`,
  `reasoning_effort`, `service_tier`, `verbosity`, `tool_choice`, `parallel_tool_calls`) —
  accepted in every mode, read only in cascade.
- `assistant_tts_model` and `assistant_tts_config`: TTS fields (used when mode is `pipeline` or
  `cascade`).
- `assistant_stt_model` and `assistant_stt_config`: STT fields. `sarvam` (default), `native`,
  `cartesia`, `deepgram`, `elevenlabs` or `openai`. `native` is pipeline-only and rejected in
  cascade; the four plugin providers run for real in cascade and are stored-but-inert in
  pipeline (the call falls back to native transcription). Ignored in realtime.

The retired `assistant_llm_mode` alias is rejected with `400` — use `assistant_mode`. Old
clients still sending it fail loudly instead of silently creating an assistant in the wrong mode.

Only known `assistant_*` fields are forwarded — the list is `ASSISTANT_FIELDS` in
`src/assistant/assistant.rules.js`. A typo or a retired key (e.g. `interaction_config.user_stt_provider`) is
dropped rather than passed on for the external API to reject with `422`. Legacy local docs
carrying `interaction_config.user_stt_provider` / `.stt_api_key` (or `stt_model: "openai"`) were
fixed by a one-time migration that has already run (see [Applied migrations](#applied-migrations)).

Language fields, three of them, easy to confuse — and each in a different code standard:
- `assistant_tts_config.target_language_code` — **single string**, BCP-47 Indic. Sarvam TTS
  only, and only the 11 codes Bulbul speaks (`en-IN`, not `en-US`).
- `assistant_stt_config.language` / `.language_code` — **single string**, in whichever standard
  the selected STT provider speaks: sarvam BCP-47 Indic (`hi-IN`), cartesia and openai
  ISO 639-1 (`hi`), deepgram BCP-47 (`hi-IN`), elevenlabs **ISO 639-3** (`hin`). Not portable
  between providers; a wrong-standard code is rejected upstream and the provider default applies.
- `assistant_interaction_config.preferred_languages` — **array of strings**, e.g.
  `["hi-IN", "en-US"]`. The only list-valued one, and the only one that is *not* a provider
  parameter: it hints the native transcription prompt, never pins a language, and never turns
  auto-detect off.

Update semantics (mirrors the external API's validation rules):
- Mode only changes on an explicit `assistant_mode`, or when TTS/STT fields are present.
  Sending `assistant_llm_config` on its own is legal in pipeline mode (rotate `api_key`, change
  `model`) and leaves the stored TTS/STT config alone.
- TTS goes out as a `model` + `config` pair; either half is enough, the other is filled in from
  the stored assistant. Switching TTS/STT provider without a new config resets to that
  provider's defaults rather than carrying the old provider's fields over.
- Switching to `cascade`: STT must not be `native` (send one of the five plugin providers in the
  same request) and `assistant_llm_config.provider` must be `openai` or omitted.
- Mode switches are validated against the **stored** assistant, not just the request, so a
  change that is only unrunnable in combination is caught before anything is pushed upstream:
  moving a stored `gemini` assistant to `pipeline`/`cascade`, or moving a stored realtime model
  ID into `cascade`, returns `400` unless the corrected `assistant_llm_config` rides along in
  the same request.

LLM provider (`assistant_llm_config.provider`):
- Vendor selector, `openai` or `gemini`. In `realtime` both are valid. In `pipeline` and
  `cascade` only `openai` is — `gemini` returns `400`.
- **Gemini is realtime-only.** Pipeline is a half-cascade: the realtime model has to run in a
  text-only response modality so an external TTS can speak the result, and Google's Live API
  does not support that on its native-audio models. Use `assistant_mode: "realtime"` instead.
- An assistant already stored on the retired `gemini` + `pipeline` pairing stays editable —
  a rename or prompt edit does not touch the LLM and is not rejected — so its owner can always
  repair it rather than being locked out of it.
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
1. The Integration row named after the selected provider. Most of them are **shared with
   another slot**, so one stored key covers both and a rotation re-syncs both:

   | `assistant_stt_model` | Integration row | Also backs |
   |---|---|---|
   | `sarvam` | `sarvam` | Sarvam TTS |
   | `cartesia` | `cartesia` | Cartesia TTS |
   | `elevenlabs` | `elevenlabs` | ElevenLabs TTS |
   | `openai` | `openai` | the LLM slot |
   | `deepgram` | `deepgram` | nothing — STT-only, and the one genuinely new row |

2. Else `400 Integration required`. As with TTS, any `api_key` in `assistant_stt_config` is overwritten.
3. `assistant_stt_model: "native"` (pipeline only) needs no key at all; its config is forwarded verbatim.

One provider, one row. The map of model → `service_name` lives in
`src/integration/providers.js`; `POST /api/integration/store` rejects any
`service_name` outside it with `400`.

Other behavior:
- `assistant_interaction_config.filler_words` is always forced to `false` in realtime mode.
- Pipeline-only TTS fields are ignored/stripped when sending realtime updates.
- `cascade` mode: STT must be one of the five plugin providers, LLM provider must be `openai`.

### Models & Providers (reference)

The allowlists live in `src/assistant/assistant.rules.js` (`OPENAI_REALTIME_MODELS`,
`OPENAI_CASCADE_MODELS`, `CASCADE_STT_MODELS`). They mirror the external API's own validators so
a bad model fails here with a readable `400` listing the valid values. When upstream adds a
model, add it there and here.

Realtime LLM (`pipeline`, `realtime`) — `provider`: `gemini` (realtime default) / `openai`
(pipeline, and the only option there); `voice`: `Puck` / `marin`, honored in realtime only.
OpenAI `model` is one of `gpt-realtime`, `gpt-realtime-1.5` (default), `gpt-realtime-mini`,
`gpt-4o-realtime-preview`, `gpt-4o-mini-realtime-preview`. Gemini model IDs are deliberately
free-form (default `gemini-3.1-flash-live-preview`) — Google ships new Live models faster than
an allowlist can track.

Cascade LLM — `provider` `openai` only; `model` validated (default `gpt-4.1`): `gpt-4.1`,
`gpt-4.1-mini`, `gpt-4.1-nano`, `gpt-4o`, `gpt-4o-mini`, `gpt-5`, `gpt-5-mini`, `gpt-5-nano`,
`gpt-5.1`, `gpt-5.1-chat-latest`, `gpt-5.2`, `gpt-5.2-chat-latest`, `gpt-5.3-chat-latest`,
`gpt-5.4`, `gpt-5.4-mini`, `gpt-5.4-nano`, `gpt-5.5`, `gpt-5.6-sol`, `gpt-5.6-terra`,
`gpt-5.6-luna`, `chat-latest`, `gpt-oss-120b`. The realtime and cascade sets are **disjoint**:
sending `gpt-4.1` in pipeline mode, or `gpt-realtime-1.5` in cascade, is a `400` either way.

Generation knobs (cascade only, all optional): `temperature` (0–2), `max_output_tokens`,
`reasoning_effort` (`none`…`max`), `service_tier` (`auto`/`default`/`flex`/`scale`/`priority`),
`verbosity` (`low`/`medium`/`high`), `tool_choice` (`auto`/`required`/`none`),
`parallel_tool_calls`. Reasoning models (`gpt-5`, `gpt-5.x`) **ignore `temperature`** — send
`reasoning_effort` instead; non-reasoning models are the reverse.

STT — five plugin providers plus `native`:

| Provider | Model default | Notable config |
|---|---|---|
| `sarvam` | `saaras:v3` (also `saaras:v2.5`, `saarika:v2.5`) | `language` `unknown` auto-detects (24 `-IN` codes); `mode` `codemix` (also `transcribe`, `translate`, `verbatim`, `translit`), honored in pipeline **and** cascade |
| `cartesia` | `ink-whisper` (43 languages) / `ink-2` (English only) | fixed `language`, no auto-detect |
| `deepgram` | `nova-3` (45 languages) / `nova-2` / `flux-general-en` / `flux-general-multi` | `language` (BCP-47 or `multi`), `enable_diarization` (nova only), `keyterm` (`nova-3`/`flux` only) |
| `elevenlabs` | `scribe_v2_realtime` (~190 languages) / `scribe_v2` / `scribe_v1` | `language_code` — **ISO 639-3** (`hin`), setting it disables auto-detect; `no_verbatim` |
| `openai` | `gpt-4o-mini-transcribe` / `gpt-4o-transcribe` / `whisper-1` | `detect_language`, `language`, `prompt` (`whisper-1` only), `noise_reduction_type`, `use_realtime` (default `true`) |
| `native` | pipeline only — the realtime LLM transcribes itself | no config |

**Omitting the language auto-detects everywhere except Cartesia.** `sarvam` → `unknown`;
`elevenlabs` → no code sent (~190 languages); `openai` → `detect_language` on; `deepgram` →
`multi` on `nova-3`/`flux-general-multi` (billed at a higher per-minute rate) and `en-US` on the
models that cannot detect; `cartesia` → `en`, since it has no detection at all. Use Sarvam or
Deepgram `multi` for a caller who switches language mid-sentence.

**The code standards are not interchangeable.** ElevenLabs is the one that bites: it takes
ISO 639-3 only, and a BCP-47 code does not degrade — Scribe closes the socket with
`1008 invalid_request` on the first utterance and the call transcribes nothing.

TTS — the synthesis model is fixed per provider **except ElevenLabs**, which takes a `model`
key (`eleven_v3` default, `eleven_multilingual_v2`, `eleven_turbo_v2_5`, `eleven_flash_v2_5`):
`cartesia` `sonic-3` (`voice_id`; plus `language`, `speed` 0–3, `volume` 0–3, `emotion`,
`pronunciation_dict_id`), `sarvam` `bulbul:v3` (`speaker`; plus `target_language_code`, `pace`
0.3–3.0, `speech_sample_rate`, `temperature` 0.01–2.0), `elevenlabs` (`voice_id`; plus
`voice_settings`), `mistral` `voxtral-mini-tts-2603` (`voice_id`, no synthesis params).

Speaking rate is spelled differently per provider and the keys are not interchangeable:
cartesia `speed`, sarvam `pace`, elevenlabs `voice_settings.speed`. Mistral has none.

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
- `DELETE /delete/:id` - Deactivate the trunk upstream (`DELETE /sip/deactivate/{trunk_id}`, a
  soft delete that keeps the record for audit) and remove the local mirror. `user_id` in
  query/body. An already-inactive or already-deleted upstream trunk (400/404) still removes the
  local row and reports `external_deactivated: false`; any other upstream failure aborts before
  the local delete, so the two sides cannot drift.

### Call (`/api/call`)

- `POST /outbound` - Trigger outbound call. Returns a `queue_id`.
- `GET /queue/:queue_id?user_id=...` - Dispatch state of a queued call: `pending`,
  `dispatching`, `dispatched` or `failed`, plus `retry_count` and `last_error`. `dispatched`
  means the handoff to the telephony provider succeeded — the live call outcome arrives via
  the end-call webhook or the assistant call logs, not here. Works for passthrough queue ids too.

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
(`sarvam`/`cartesia`/`elevenlabs`/`mistral`) match by `tts_model`, and STT keys
(`sarvam`/`cartesia`/`deepgram`/`elevenlabs`/`openai`) match by `stt_model`. A shared key covers
every slot it backs, in one request per assistant: rotating `sarvam`, `cartesia` or `elevenlabs`
re-pushes **both** the TTS and the STT config, and rotating `openai` re-pushes **both** the LLM
and the cascade STT config. Assistants created with their own per-request
`assistant_llm_config.api_key` / `assistant_tts_config.api_key` are left untouched.

Frontend flow: after `POST /store` (or `POST /resync`), poll `GET /resync-status` every ~2s until
`status !== "running"`; show `processed / total` progress, then `succeeded` and the `failed[]`
list. Re-store the key or call `POST /resync` to retry failures.

Legacy rows predating `llm_provider`, the `tts_model` / `tts_config` rename and the `sarvam_stt`
provider have all been migrated — see [Applied migrations](#applied-migrations).

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
- `GET /call-records?user_id=...` - List call records, passthrough-only by default. Optional:
  `to_number`, `call_status`, `start_date`, `end_date`, `limit` (1-100), `page` (1-based),
  `sort_by` (`started_at` | `ended_at` | `call_duration_minutes`), `sort_order` (`asc` | `desc`),
  and `passthrough_only=false` to include AI calls. Every record carries `is_passthrough`, so a
  mixed result is still unambiguous. **`offset` is gone** — the external API never read it, so
  every page but the first silently returned page 1; use `page`.

### Inbound (`/api/inbound`)

A mapping needs an assistant to route calls; a context strategy is optional. Without one
the number routes normally, with no caller-context lookup and no added latency.

- `POST /assign` - Assign inbound number. `inbound_context_strategy_id` is optional and takes a local `_id` or the external id. 404 if the assistant or strategy is unknown, 409 if the number is already assigned.
- `GET /list?user_id=...` - List inbound mappings, including `assistant_name` and `inbound_context_strategy_name`.
- `PATCH /update/:id` - Update inbound mapping (`user_id` in body). Send `assistant_id` and/or `inbound_context_strategy_id`; `null` detaches either one.
- `POST /detach/:id` - Detach inbound mapping (`user_id` in query/body). Clears both the assistant and the strategy; the mapping stays active.
- `DELETE /delete/:id` - Delete inbound mapping (`user_id` in query/body). Releases the normalized number for reuse.

### Inbound Context Strategy (`/api/inbound-context-strategy`)

A strategy attaches to an inbound *number*, not to an assistant, so the same assistant can
answer three numbers with three different strategies. The webhook fires once per call
before the prompt renders; its `context` object becomes `{{context.*}}`. A failing lookup
never fails the call — the prompt just renders those placeholders empty.

- `POST /create` - Create strategy. `strategy_config`: `url` (http/https, no private or internal hosts), optional `headers`, optional `timeout_seconds` (`0.5`-`10.0`, default `2.0` — it blocks the start of the call, so keep it low).
- `GET /list?user_id=...` - List strategies.
- `GET /details/:id?user_id=...` - Strategy details.
- `PATCH /update/:id` - Update strategy (`user_id` in body). `headers` merges key by key: send only what you are changing, and send a header with value `null` to delete it. Other `strategy_config` keys replace outright.
- `DELETE /delete/:id` - Delete strategy (`user_id` in query/body). Cascades: every inbound mapping referencing it is detached from the strategy, but keeps routing.

Secret-looking header values (`authorization`, `token`, `secret`, `api-key`, `password`)
come back masked as `****` from list/details. Sending a mask back on update is rejected
with 400 — that guard is what stops a fetch-edit-save round trip from overwriting a real
token with the literal string `****`.

Strategy ids and inbound ids accept either the local Mongo `_id` or the external id.
Validation of url, headers, and timeout is owned by the external API; its status and
message pass through unchanged (FastAPI `detail` entries are flattened to
`field: message`).

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
├── AGENTS.md
├── scripts/                  # one-off migrations and self-checks
├── tests/                    # node --test suite, mirrors src/
└── src/
    ├── index.js              # runner: config → connectDB → listen
    ├── server.js             # wiring only: middleware, swagger, route mounts, error handlers
    ├── api/
    │   └── routes/           # one thin module per endpoint group (validation + delegation)
    │       └── common.js     # route-level error-status helpers
    ├── assistant/            # domain: orchestration + payload rules/builders + xlsx export
    │   ├── assistant.service.js  # create/list/details/delete + public surface for the rest
    │   ├── assistant.update.js   # update flow: target mode, upstream patch, local mirror
    │   ├── assistant.billing.js  # call logs + billable-minute aggregation (paged, bounded fan-out)
    │   ├── assistant.rules.js    # ASSISTANT_FIELDS, mode inference, pair resolution (pure)
    │   ├── assistant.builder.js  # TTS/STT/LLM config construction + key resolution
    │   ├── assistant.resync.js   # key-rotation re-sync job
    │   └── exporter.js       # platform-wise billable minutes xlsx workbook
    ├── auth/                 # domain: user lifecycle (register/login/key) + userAccess guard
    ├── integration/          # domain: provider map (providers.js) + key storage/re-sync
    ├── analytics/            # domain: analytics proxy
    ├── call/                 # domain: outbound call trigger
    ├── audio/                # domain: audio library proxy
    ├── sip/                  # domain: SIP trunk CRUD
    ├── tool/                 # domain: tool CRUD + attach/detach
    ├── webcall/              # domain: web-call token
    ├── inbound/              # domain: inbound mapping CRUD
    ├── inbound-context-strategy/  # domain: context strategy CRUD
    ├── passthrough/          # domain: web-to-SIP passthrough calls
    ├── services/
    │   └── livekit/          # the ONLY external HTTP client (callExternal) — axios lives here
    │       └── livekitService.js
    └── core/
        ├── config.js         # Settings singleton — the only place process.env is read
        ├── async/mapLimit.js # bounded-concurrency map, ordered results (billing fan-out)
        ├── db/
        │   ├── dbConnect.js
        │   ├── schemas/      # one mongoose model per file (user, assistant, sip, tool, ...)
        │   └── functions/    # query helpers (findByLocalOrExternalId)
        ├── middleware/
        │   ├── asyncHandler.js
        │   ├── errorHandler.js   # one response shape for every error path
        │   └── notFound.js
        └── logging/logger.js
```

Layer rules (see `.agents/skills/node-service-structure/`):
- `src/api/routes/` — HTTP surface only: validate, delegate, shape. No queries, no external calls.
- `src/<domain>/` — business logic and orchestration.
- `src/services/<upstream>/` — external I/O clients only; `axios` appears nowhere else.
- `src/core/` — config, DB access, middleware, logging. `process.env` appears nowhere else.
- Every error path returns `{ error: message }` via `src/core/middleware/errorHandler.js` — handlers never build error bodies.
- Logging goes through `getLogger(module)`; no `console.*` in application code, and never
  log an upstream response body (they carry API keys).

### Billable minutes is the expensive endpoint

Upstream has no billable-minutes aggregate, so `GET /api/assistant/platform-billable-minutes`
builds one here: every assistant the user owns, every page of its call logs at 100 rows a page.
Cost grows with account history, and with no `start_date`/`end_date` the window is the user's whole
lifetime. Two things keep it honest:

- The fan-out runs through `mapLimit` at `ASSISTANT_CONCURRENCY` × `PAGE_CONCURRENCY` (5 × 5) rather
  than serially. Page 1 is still fetched first — it is what reports `total_pages`.
- A per-assistant read failure is skipped, not fatal, so the response reports
  `assistants_evaluated` / `assistants_skipped` and says so in `message`. A partial total presented
  as a complete one is the failure mode worth guarding here.

If it ever needs to be faster than this, the next step is a cache keyed on user + date window — not
a bigger concurrency number.

## Data Stores

MongoDB, one collection per model in `src/core/db/schemas/`. Every resource row is
scoped by `user_id`, and local rows carry the external LiveKit id so callers can use
either identifier.

| Collection | Keyed by | Holds |
|---|---|---|
| `users` | `user_email` (unique) | account, bcrypt password hash, external `api_key` |
| `assistants` | `user_id` + `external_assistant_id` | name, prompt, `llm_mode` (pipeline/realtime/cascade), `llm_provider`, LLM/TTS/STT config, interaction + end-call settings, greeting audio |
| `siptrunks` | `user_id` + `external_trunk_id` | trunk name, type (`twilio`/`exotel`), trunk config, passthrough mode + webhook |
| `tools` | `user_id` + `external_tool_id` | tool name, description, execution type, parameters, execution config |
| `inbounds` | `external_inbound_id` (unique) | phone number (raw + normalized), service, attached assistant, context-strategy id, inbound config |
| `inboundcontextstrategies` | `external_strategy_id` (unique) | strategy name and type (default `webhook`) only — `strategy_config` lives upstream, which merges headers and masks secrets, so a local copy would go stale |
| `integrations` | `user_id` + `service_name` (unique) | provider API key and its `service_type` (TTS/STT/LLM) |
| `resyncjobs` | `user_id` + `service_name` (unique) | one key-rotation re-sync job: status, totals, per-assistant failures |

## Scripts

- `npm start` - Start API server.
- `npm run dev` - Same, with `node --watch` auto-restart.
- `npm test` - Run the `node --test` suite under `tests/`.
- `node scripts/check-assistant-payload.js` - Self-check for assistant payload rules.
- `node src/integration/providers.js` - Self-check for the provider key map.

### Applied migrations

These one-time scripts have run against production and were deleted afterwards — the schema
they produced is the current one, so nothing needs re-running. Recover any of them from git
history (`git log --diff-filter=D -- scripts/`) if an old database ever has to be brought forward.

| Script | What it did |
|---|---|
| `migrate-stt-config.js` | dropped `interaction_config.user_stt_provider` / `.stt_api_key`, rewrote `stt_model: "openai"` (which then *meant* native; `openai` is now a real cascade STT provider again, so post-migration rows selecting it are genuine selections, not leftovers) |
| `migrate-tts-field-names.js` | renamed assistant `model` / `config` to `tts_model` / `tts_config` |
| `backfill-llm-provider.js` | set `llm_provider` from `llm_config.provider`, defaulting to `openai` |
| `drop-sarvam-stt-rows.js` | removed unreachable `sarvam_stt` integration rows and their re-sync jobs |
