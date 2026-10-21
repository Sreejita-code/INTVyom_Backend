# Scope — 1.7.0 duplex call-log / usage recheck

## Original request (verbatim)

> -> "api-livekit-docs" Take a look into this MCP and the latest change log. There are a few things that have been changed in the call logs and everything. A few things have already been updated, such as the Gemini part and everything, but a few things like call logs, the values, and all things have been changed for the duplex models. Please take a look and tell me: do we need anything to be changed here, or is it okay?

## Facts so far

- Latest upstream changelog is 1.7.0 (2026-10-21). Repo already synced and audited for 1.7.0 earlier today (`2026-10-21-audit-upstream-1-7-0-drift`, `2026-10-21-feature-upstream-1-7-0-sync`).
- Upstream duplex usage change: `model_usage` entries typed `voice_llm_usage` / `backend_llm_usage` (was `llm_usage`); `Cost by model` worker log line; service tiers priced.
- Quick grep: `voice_llm_usage` / `backend_llm_usage` appear nowhere in src, swagger.yaml, docs, tests. Usage is forwarded unchanged.

## Agreed scope

| Item | Answer |
|------|--------|
| Target | call-log/usage passthrough, analytics, end-call webhook code, swagger.yaml, docs/, tests/ (default) |
| Depth | standard (default) |
| Out of scope | SIP/trunks, auth, infra, Gemini work already done (default) |
| Constraints | no source edits, no new deps (default) |
| Success criteria | each duplex call-log/usage changelog item marked match/gap with file:line; stored-record impact stated (default) |
| Output | HTML, all findings (default) |
| Audit: fix or report only | report only, proposed patch in report (default) |

## Clarification log

- Q1 (target/depth/output/fix-or-report): asked and answered 2026-10-21: "defaults".
