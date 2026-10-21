# Scope — sync proxy with upstream 1.7.0

## Original request (verbatim)

> Yes, do it with the fixes for Gemini, as you are telling me, the fixes that are necessary. And do it properly with the skills, and update the docs and everything properly. As well as the swaggers

Follows audit `2026-10-21-audit-upstream-1-7-0-drift` (approved by this answer; audit and fix are split into two tasks per core-be-workflow).

## Agreed scope

| Item | Answer |
|------|--------|
| Target | Gemini realtime knob refusal (validation), docs for 1.7.0 (ASSISTANT-RULES, UPSTREAM, CHANGELOG, swagger, README if affected) |
| Depth | standard |
| Out of scope | duplex code (already synced in 1.6.0), pricing, SIP, frontend |
| Constraints | no new deps; no git side effects; stored rows must stay repairable |
| Success criteria | Gemini realtime + any of the 5 refused knobs -> local 400/422 naming field; `null` clears a stored one; temperature/max_output_tokens still accepted; docs and swagger match; `npm test` green |
| Output | HTML report in agent-tracking/reports |
| Fix or report | fix, as approved |

## Acceptance criteria

1. Create/update with `assistant_mode: realtime`, provider `gemini` (explicit or defaulted) and any of `reasoning_effort`, `verbosity`, `service_tier`, `tool_choice`, `parallel_tool_calls` set is refused locally, message names every offending field, nothing reaches upstream.
2. `temperature`, `max_output_tokens` are accepted for Gemini.
3. A stored Gemini row holding a refused knob can be repaired: sending the field as `null` passes; an LLM-config PATCH that leaves it in place is refused with the repair hint; a PATCH not touching the LLM config is not judged locally (upstream decides), so a rename is never blocked by this check.
4. OpenAI realtime/pipeline unchanged (knobs still accepted/ignored); legacy gemini/pipeline rows stay editable.
5. Docs: ASSISTANT-RULES, UPSTREAM, CHANGELOG (**BREAKING**), swagger descriptions, usage `duplex` fields.
