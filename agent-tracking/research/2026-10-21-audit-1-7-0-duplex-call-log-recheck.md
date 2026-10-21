# Research — 1.7.0 duplex call-log / usage recheck

Upstream pages read this session: `changelog.md`, `api/assistant/logs.md`, `reference/usage-accounting.md`,
`api/analytics/tokens-by-model.md`, `api/calls/webhook.md`, `api/calls/usage.md`, plus search for the
field names below.

## Upstream 1.7.0 duplex facts

- `model_usage` of a duplex call has two entries: `type: voice_llm_usage` (GPT-Live, `session_duration`,
  billed per second) and `type: backend_llm_usage` (backend model, tokens). Each carries its own
  `estimated_cost_usd` and `pricing_complete`. Record `estimated_cost_usd` is their sum.
- `usage.llm_model` for duplex is comma-separated: `gpt-live-1, gpt-6-luna-2026-09-30`.
- Pre-1.7.0 duplex rows keep `llm_usage` on both entries.
- `pricing_schema_version` is `2` from 1.7.0 (service tiers priced); `1` rows left non-default tiers unpriced.
- Tier pricing: `flex` x0.5, `fast`/`priority` x2, token-billed only; in duplex the tier scales the backend only.
- Worker logs one `Cost by model` line per call.
- Searched upstream for `estimated_cost_voice_usd`, `estimated_cost_backend_usd`, `voice_model`, `backend_model` as
  usage keys: not found in any usage, webhook, logs or analytics page.

## Local code

- `src/assistant/assistant.billing.js:103-109` `getCallLogs` forwards the upstream body unchanged.
- `assistant.billing.js:124,172` reads only `billable_duration_minutes`, `to_number`, `platform_number`. Not affected.
- `src/api/routes/analytics.routes.js:18-24` proxies dashboard, by-assistant, by-phone-number, by-time, by-service.
  No `/analytics/tokens/*` and no `/call/records/*/usage` route, so those type renames do not reach this proxy.
- No `voice_llm_usage` / `backend_llm_usage` string in `src/`, `swagger.yaml`, `docs/`, `tests/`. No code branches on `model_usage[].type`.

## Local docs claiming fields upstream does not document

- `swagger.yaml:3758-3760` (`AssistantCallLog.usage` description)
- `docs/ASSISTANT-RULES.md:239-243` (end-call webhook section)
- `docs/CHANGELOG.md:14-15`
All three say duplex `usage` carries `voice_model`, `backend_model`, `estimated_cost_voice_usd`, `estimated_cost_backend_usd`.

## Open
- Was this wording copied from an earlier upstream revision, or invented? Not decidable from the repo; upstream today is authoritative.
