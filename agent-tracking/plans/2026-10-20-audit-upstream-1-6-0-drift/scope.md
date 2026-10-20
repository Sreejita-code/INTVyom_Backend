# Scope — 2026-10-20-audit-upstream-1-6-0-drift

- **Type:** audit (report-only; fixes are a separate planned task)
- **Requested by:** repo owner
- **Date:** 2026-10-20

## Original request (verbatim)

> -> "api-livekit-docs" Take a look into this MCP, and there are many things that has changed in my the core Lifekit code. You can take a look into the change logs through these MCPs and everything, and also the APIs and everything. There are new modes that has been added along with pipeline cascade and real time, and there are different APIs that has been added, and a few models has been dropped. A few models have different names that have been added, and some new models have been added.
>
> Take a look into this MCP and some of the things that are not present here. Take a look through all the documentation, all the APIs, and the new things that have been changed. You will get an overall summary through the change logs that are present in that MCP.
>
> Take a look and help me understand, and provide me a plan for what other things need to be added here, what other securities need to be added here, and what other validations need to be added here so that it makes it proper. First, provide me a plan and ask me if something is needed.

## Agreed scope

| Question | Answer |
|----------|--------|
| Target (paths / endpoints / diff) | `src/assistant/*`, assistant schema, templates, swagger.yaml, README, tests. Upstream drift for models and modes (duplex, gpt-6, realtime-2.1, eleven_v4, bulbul:v4-flash, retired models). New upstream endpoints are NOT in scope (user: models and call modes only) |
| Depth (quick / standard / deep) | standard (defaulted) |
| Out of scope | security audit (user: skip), new endpoints (health, usage, analytics tokens, admin, activity-logs), infra/Docker |
| Constraints | no code changes in this task; stored assistants must stay repairable |
| Success criteria | report lists every model/mode/validation drift with file:line, plus an approved-ready fix plan |
| Report format (HTML / MD) | HTML (default) |
| Severity cut-off | all |
| Type-specific answers | audit: report-only, then separate fix task. Stored gpt-5.1 / gpt-5.4-nano rows: reject new, keep repair path, migration script |

## Assumptions confirmed with the user

- none yet

## Clarification log

| Question asked | User's answer |
|----------------|---------------|
| Deliverable, new endpoints, security depth, stored rows | Report + fix plan; models and modes only; skip security; reject new, allow repair |
