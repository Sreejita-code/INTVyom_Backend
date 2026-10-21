# Research — upstream 1.7.0 drift

Sources: api-livekit-docs `changelog.md`, `reference/models.md`, `reference/compatibility.md`, `concepts/duplex.md`. Read 2026-10-21.

## Changelog 1.7.0 vs repo

| # | Upstream 1.7.0 | Repo state | Verdict |
|---|----------------|-----------|---------|
| 1 | Gemini realtime: `reasoning_effort`, `verbosity`, `service_tier`, `tool_choice`, `parallel_tool_calls` -> 422. `temperature`, `max_output_tokens` now sent. | `src/assistant/assistant.validation.js` `validateModelParameters` returns early for any provider other than `openai` (no local check). Create: upstream 422 passes through `callExternal`. Stored Gemini rows holding these knobs: PATCH is validated locally (passes), upstream 422s. Repair path exists: `mergeLlmConfig` deletes keys sent as `null`. No local message naming the field, no docs. | Gap (Medium): not a break, but late, upstream-worded error; docs/swagger silent. |
| 2 | Duplex usage: `voice_model`, `backend_model`, `estimated_cost_voice_usd`, `estimated_cost_backend_usd` in webhook `usage`. | Proxy passes call logs/webhook through; `docs/ASSISTANT-RULES.md` ~226 says `usage.mode: pipeline | realtime | cascade` (no `duplex`) and lists no new fields; swagger `usage` is a free-form object. | Docs stale only (Low). No code change. |
| 3 | Service tiers priced (`flex` 0.5x, `fast`/`priority` 2x). | Local `SERVICE_TIERS` = auto, default, fast, priority, flex; `flex` gated to GPT5_GENERATION (`assistant.validation.js:338-345`). Upstream models.md still says `flex` gpt-5 generation only, but also says gpt-6 accepts `flex`. Check `GPT5_GENERATION` contains `gpt-6-*`. | Verify (see open question). |
| 4 | Duplex settings (user's question): `backend_model`, `backend_instructions`, generation knobs, no `temperature`, no greeting audio/filler/text_only. | Implemented in 1.6.0 sync: `validateDuplexLlmConfig`, `validateDuplexRestrictions`. | Match (not re-verified line by line yet). |

## Open questions

- Does `GPT5_GENERATION` include `gpt-6-luna` / `gpt-6-sol`? (flex and verbosity depend on it.)
- Do tests cover a Gemini realtime config carrying a refused knob?
