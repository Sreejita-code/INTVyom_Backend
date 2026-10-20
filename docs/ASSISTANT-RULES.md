# Assistant rules and reference

How the backend validates and builds assistant payloads: update semantics, which key goes into
which slot, the model allowlists, and the end-of-call webhook body. The request and response
shapes live in `swagger.yaml` (`/api-docs`, MCP `get_endpoint`); this page holds the behaviour
those shapes do not show. Moved here from the README so the README stays a run guide.

## Update semantics

Mirrors the external API's validation rules. Last synced with upstream 1.6.0.

- Mode only changes on an explicit `assistant_mode`, or when TTS/STT fields are present.
  Sending `assistant_llm_config` on its own is legal in pipeline mode (rotate `api_key`, change
  `model`) and leaves the stored TTS/STT config alone. `assistant_llm_config` merges
  **key-by-key** with the stored config (a PATCH naming only `model` keeps the stored provider,
  `api_key` and knobs) — so a stored `temperature` on a chat model blocks a model-only switch
  to a reasoning model, and a stored Gemini `voice` blocks a provider-only switch to `openai`,
  until the stale key is cleared (`null`) in the same request.
- TTS goes out as a `model` + `config` pair; either half is enough, the other is filled in from
  the stored assistant. Switching TTS/STT provider without a new config resets to that
  provider's defaults rather than carrying the old provider's fields over. Switching to a
  speech mode when **nothing** is stored demands both halves in the same request; an unrelated
  edit on such a legacy row still works.
- TTS/STT model ids and Sarvam speakers are validated only against request values (never the
  stored row), so a legacy row stored on a retired id stays editable.
- Switching to `cascade`: STT must not be `native` (send one of the five plugin providers in the
  same request) and `assistant_llm_config.provider` must be `openai` or omitted.
- Mode switches are validated against the **stored** assistant, not just the request, so a
  change that is only unrunnable in combination is caught before anything is pushed upstream:
  moving a stored `gemini` assistant to `pipeline`/`cascade`, or moving a stored realtime model
  ID into `cascade`, returns `400` unless the corrected `assistant_llm_config` rides along in
  the same request.

### LLM provider (`assistant_llm_config.provider`)

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

### Other behavior

- `assistant_interaction_config.filler_words` is always forced to `false` in realtime mode, and
  is a `400` when `true` in duplex mode.
- Pipeline-only TTS/STT fields are stripped when the request switches the assistant to
  `realtime`. A TTS/STT-only edit on a stored `realtime` or `duplex` assistant keeps its mode
  (before upstream 1.6.0 it was inferred as `pipeline`): the mode is not sent, and upstream
  stores the speech block without using it.
- `cascade` mode: STT must be one of the five plugin providers, LLM provider must be `openai`.

## API key resolution

Provider keys come from the Integration store, never from the request, except the per-assistant LLM
override below.

### LLM key (`assistant_llm_config.api_key`)

1. `assistant_llm_config.api_key` from the request (per-assistant override), else
2. Integration key with `service_name` = the provider (`openai` / `gemini`), else
3. In **pipeline** mode the field is omitted and the external API uses its own system key — a
   missing integration is not an error. In **realtime** mode a key is mandatory:
   `400 Integration required`.

### TTS key (pipeline only)

1. Integration key with `service_name` = the TTS model (`sarvam` / `cartesia` / `elevenlabs` / `mistral`), else
2. `400 Integration required`. Any `api_key` in `assistant_tts_config` is **overwritten** — there is
   no per-assistant override for TTS.

### STT key (pipeline and cascade)

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

## Models & Providers (reference)

The allowlists live in `src/assistant/assistant.rules.js` (`OPENAI_REALTIME_MODELS`,
`OPENAI_CASCADE_MODELS`, `GEMINI_LIVE_MODELS`, `CASCADE_STT_MODELS`, `STT_MODELS_BY_PROVIDER`,
`ELEVENLABS_TTS_MODELS`, `SARVAM_SPEAKERS`). They mirror the external API's own validators so a
bad model fails here with a readable `400` listing the valid values. When upstream adds a model,
add it there and here.

Refreshed 2026-09-22 — three traps worth remembering: `saaras:v4` and `nova-3-multilingual` are
new while `saaras:v2.5`, `saarika:v2.5` and `nova-2` are gone (upstream rejects all three);
`gemini-3.8-live` is now the Gemini default and `gemini-live-2.5-flash-native-audio` is Vertex-only
and rejected; Sarvam TTS takes `en-IN`, never `en-US`.

Realtime LLM (`pipeline`, `realtime`) — `provider`: `gemini` (realtime default) / `openai`
(pipeline, and the only option there); `voice`: `Puck` / `marin`, honored in realtime only.
OpenAI `model` is one of `gpt-realtime`, `gpt-realtime-1.5` (default), `gpt-realtime-2`,
`gpt-realtime-2025-08-28`, `gpt-realtime-mini`. The retired preview pair
(`gpt-4o-realtime-preview`, `gpt-4o-mini-realtime-preview`) is rejected — those accounts opened
a session that could never connect. Gemini `model` is one of `gemini-3.8-live` (upstream default,
and what the starter template pins), `gemini-3.8-live-extended-thinking`,
`gemini-3.1-flash-live-preview`, `gemini-2.5-flash-native-audio-preview-12-2025` — a non-Live
Gemini ID (e.g. `gemini-2.5-flash`) is a `400`: it opens a socket the API then closes. The plugin
also lists `gemini-live-2.5-flash-native-audio`, but it is the Vertex AI id and is rejected with a
`422`. Gemini `voice` is
a closed 30-name roster (the SDK's `gemini_tts.py` list; `Puck` default) — anything else is a
`400`; OpenAI `voice` accepts any name that is not a Gemini voice (the catch: a Gemini voice
under `openai` is the exact mistake this blocks).

Cascade LLM — `provider` `openai` only; `model` validated (default `gpt-4.1`): `gpt-4.1`,
`gpt-4.1-mini`, `gpt-4.1-nano`, `gpt-4o`, `gpt-4o-mini`, `gpt-5`, `gpt-5-mini`, `gpt-5-nano`,
`gpt-5.2`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.5`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`,
`gpt-6-luna`, `gpt-6-sol`. The realtime and cascade sets are **disjoint**: sending
`gpt-4.1` in pipeline mode, or `gpt-realtime-1.5` in cascade, is a `400` either way. The
pipeline/realtime OpenAI set is `gpt-realtime`, `gpt-realtime-1.5` (default), `gpt-realtime-2`,
`gpt-realtime-2.1`, `gpt-realtime-2.1-mini`, `gpt-realtime-2025-08-28`, `gpt-realtime-mini`.

**Retired: `gpt-5.1` and `gpt-5.4-nano`** (OpenAI retires them on 2027-04-01; upstream 1.6.0
removed them). A request that names one is a `400` naming the replacement (`gpt-6-sol`,
`gpt-6-luna`). An assistant that already stores one is **not** locked out here: renames and other
edits that do not touch `assistant_llm_config` or `assistant_mode` still go through, and a PATCH
that sends the replacement model moves it. Upstream may itself refuse other PATCHes to such a
row until it moves; `node scripts/migrate-retired-models.js` lists them, `--apply` moves them.
The `gpt-6` models are reasoning models: `reasoning_effort` `none`…`xhigh` (not `minimal`),
`verbosity` and `flex` accepted, `temperature` rejected.

Duplex mode (`assistant_mode: "duplex"`, OpenAI GPT-Live): `provider` `openai` only; `model` is
`gpt-live-1`; `voice` one of `beacon`, `cedar`, `cinder`, `marin` (default), `stone`, `vesper`;
`backend_model` any current reasoning model (default `gpt-5.6-luna`) that runs reasoning and
tools; `backend_instructions` up to 4000 characters. The generation knobs are checked against
`backend_model`, and `temperature` is a `400`. GPT-Live cannot speak a fixed string, so an
enabled `assistant_greeting_audio` and `filler_words: true` are `400`s, checked against the
merged stored row on update (a stored recording or filler flag blocks the switch until the same
request turns it off), and upstream refuses `text_only` web calls. TTS/STT fields are
stored and ignored. Switching into or out of duplex replaces the stored `assistant_llm_config`
(here and in the local mirror) instead of merging it; leaving `realtime` does the same.

Generation knobs (cascade only, all optional): `temperature` (0–2), `max_output_tokens`,
`reasoning_effort` (`none`…`max`), `service_tier` (`auto`/`default`/`fast`/`flex`/`priority`;
`flex` only on the gpt-5 generation), `verbosity` (`low`/`medium`/`high`), `tool_choice`
(`auto`/`required`/`none`; `required` needs a tool attached — see `tool_ids` /
`assistant_end_call_enabled`), `parallel_tool_calls`. Reasoning models (`gpt-5`, `gpt-5.x`)
**ignore `temperature`** — send `reasoning_effort` instead; non-reasoning models are the
reverse. The knob checks run against the merged stored+request LLM config, so a `temperature`
stored on a chat model blocks a later model-only switch to a reasoning model until it is
cleared (`temperature: null`) in the same request.

STT — five plugin providers plus `native`:

| Provider | Model default | Notable config |
|---|---|---|
| `sarvam` | `saaras:v3` (also `saaras:v4`) | `language` `unknown` auto-detects (24 `-IN` codes); `mode` `codemix` (also `transcribe`, `translate`, `verbatim`, `translit`), honored in pipeline **and** cascade |
| `cartesia` | `ink-whisper` (43 languages) / `ink-2` (English only) | fixed `language`, no auto-detect |
| `deepgram` | `nova-3` (45 languages) / `nova-3-general` / `nova-3-multilingual` / `flux-general-en` / `flux-general-multi` | `language` (BCP-47 or `multi`), `enable_diarization` (nova only), `keyterm` (`nova-3`/`flux` only) |
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
key (`eleven_v3` default, `eleven_v3_conversational`, `eleven_v4`, `eleven_v4_turbo`,
`eleven_multilingual_v2`, `eleven_turbo_v2_5`, `eleven_flash_v2_5`; the v1 models are rejected),
and **Sarvam**, which takes `model` `bulbul:v3` (default) or `bulbul:v4-flash`:
`cartesia` `sonic-3` (`voice_id`; plus `language`, `speed` 0–3, `volume` 0–3, `emotion`,
`pronunciation_dict_id`), `sarvam` (`speaker`; plus `target_language_code`, `pace`,
`speech_sample_rate`, `temperature`), `elevenlabs` (`voice_id`; plus `voice_settings`),
`mistral` `voxtral-mini-tts-2603` (`voice_id`, no synthesis params).

Rules mirrored in `src/assistant/tts-rules.js` (one module; change it when upstream changes):
- ElevenLabs `voice_settings` per model — `eleven_v3` reads only `stability`;
  `eleven_v3_conversational` adds `use_speaker_boost`; `eleven_v4` / `eleven_v4_turbo` read
  `stability` and `similarity_boost` (**not** `speed`); `eleven_turbo_v2_5` / `eleven_flash_v2_5`
  all but `style` and `use_speaker_boost`; only `eleven_multilingual_v2` reads all five. A setting
  the model ignores is a `400` (upstream `422`) — ElevenLabs itself would accept and ignore it.
- Sarvam `bulbul:v3`: 30 speakers, `pace` 0.3–3.0, any of 7 sample rates, `temperature`
  0.01–2.0. `bulbul:v4-flash`: 224 speakers, `pace` 0.5–2.0, sample rates 8000/16000/22050/24000,
  `temperature` **rejected** (Sarvam fixes it at 0.6). Both speak 11 language codes (`en-IN`, not
  `en-US`); only v4-flash speaks the 12 IN22 codes (`as-IN`, `ur-IN`, …), and only on a Sarvam
  subscription that enables them, which cannot be checked here. A PATCH that sends only
  `speaker`, `pace`… is judged against the stored Sarvam model.

Speaking rate is spelled differently per provider and the keys are not interchangeable:
cartesia `speed`, sarvam `pace`, elevenlabs `voice_settings.speed`. Mistral has none.

## End-Call Webhook Payload

`assistant_end_call_url` (AI calls) and `passthrough_webhook_url` (passthrough calls) receive a
POST with the full call record on every terminal outcome (`completed`, `busy`, `no_answer`,
`rejected`, `cancelled`, `unreachable`, `timeout`, `failed`).

Delivery tuning is per assistant: `assistant_end_call_webhook` = `{ timeout_seconds: 1–120,
attempts: 1–5 }`. On PATCH the object is merged key by key (like `interaction_config`); an omitted
or `null` key falls back to the server default (`timeout_seconds` 30, `attempts` 3). Retries cover
connection errors, read timeouts, `429` and `5xx`; other `4xx` are not retried, so make the endpoint
idempotent (key on `data.room_name`, or `data.queue_id` for outbound).

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

## Client notes

Behaviour that is easy to miss from the schemas alone:

- `GET /api/assistant/list`: `limit` defaults to 100 here, not upstream's 10, because existing
  clients expect the whole list in one call.
- Integration re-sync: after `POST /api/integration/store` (or `POST /resync`), poll
  `GET /resync-status` about every 2 s until `status !== "running"`, show `processed / total`, then
  `succeeded` and the `failed[]` list. Re-store the key or call `POST /resync` to retry failures.
- `DELETE /api/inbound/delete/{id}` releases the normalized number for reuse.
- Signup runs both uniqueness checks (email, `user_name`) before asking upstream for a key, so a
  rejected signup never mints a key.
