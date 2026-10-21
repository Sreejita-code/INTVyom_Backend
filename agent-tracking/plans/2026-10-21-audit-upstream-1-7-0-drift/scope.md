# Scope — upstream 1.7.0 drift check

## Original request (verbatim)

> Take a look into the "api-livekit-docs" In this MCP, there are a few changes. If you take a look into the change logs in that MCP, there are a few settings of Gemini that have been changed. A few settings of the GPT-G duplex model have been added. I don't know what settings might need to be changed there. If you take a look into the latest change log, is there anything needed to be changed here, or is everything fine?

## Facts from upstream changelog 1.7.0 (2026-10-21)

- Gemini realtime: `reasoning_effort`, `verbosity`, `service_tier`, `tool_choice`, `parallel_tool_calls` now 422 (provider `gemini`); `temperature`, `max_output_tokens` now sent.
- Duplex: end-call webhook `usage` gains `voice_model`, `backend_model`, `estimated_cost_voice_usd`, `estimated_cost_backend_usd`.
- Service tiers priced: flex 0.5x, fast/priority 2x.
- Repo was last synced to 1.6.0.

## Agreed scope

| Item | Answer |
|------|--------|
| Target | src/assistant/ rules/validation/update/builder/Gemini template, usage + webhook passthrough, swagger.yaml, docs/ |
| Depth | standard |
| Out of scope | SIP/trunks, auth, frontend, infra (default) |
| Constraints | no edits to source; no new deps (default) |
| Success criteria | every 1.7.0 changelog item marked match/gap with file:line evidence; stored-data impact stated |
| Output | HTML, all findings |
| Audit: fix or report only | report only |

## Clarification log

- Q1 (target/depth/output/fix-or-report): asked and answered 2026-10-21 (defaults: standard, report only, HTML).
