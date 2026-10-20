# Data stores

MongoDB, one collection per model in `src/core/db/schemas/`. Every resource row is
scoped by `user_id`, and local rows carry the external LiveKit id so callers can use
either identifier.

| Collection | Keyed by | Holds |
|---|---|---|
| `users` | `user_email` (unique) | account, bcrypt password hash, external `api_key` |
| `assistants` | `user_id` + `external_assistant_id` | name, prompt, `llm_mode` (pipeline/realtime/cascade/duplex), `llm_provider`, LLM/TTS/STT config, interaction + end-call settings, greeting audio |
| `siptrunks` | `user_id` + `external_trunk_id` | trunk name, type (`twilio`/`exotel`), trunk config, passthrough mode + webhook |
| `tools` | `user_id` + `external_tool_id` | tool name, description, execution type, parameters, execution config |
| `inbounds` | `external_inbound_id` (unique) | phone number (raw + normalized), service, attached assistant, context-strategy id, inbound config |
| `inboundcontextstrategies` | `external_strategy_id` (unique) | strategy name and type (default `webhook`) only — `strategy_config` lives upstream, which merges headers and masks secrets, so a local copy would go stale |
| `integrations` | `user_id` + `service_name` (unique) | provider API key and its `service_type` (TTS/STT/LLM) |
| `resyncjobs` | `user_id` + `service_name` (unique) | one key-rotation re-sync job: status, totals, per-assistant failures |
