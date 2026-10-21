# Scope — fix 1.7.0 duplex usage docs (follow-up to audit)

## Original request (verbatim)

> Okay, yes, the things look nice. Create a plan, update the things, and properly update the docs and everything.

## Source

Findings D-1, D-2, D-3 of `reports/2026-10-21-audit-1-7-0-duplex-call-log-recheck.html`.

## Agreed scope

| Item | Answer |
|------|--------|
| Target | `swagger.yaml`, `docs/ASSISTANT-RULES.md`, `docs/CHANGELOG.md` (docs only) |
| Depth | n/a (edit task) |
| Out of scope | `src/` code, tests logic, README (no endpoint/env/script change), non-usage docs |
| Constraints | no contract or behaviour change; no new deps; no git commit |
| Success criteria | the four invented keys gone; real `model_usage` shape documented; `call_end_reason` lists four values; `npm test` green; swagger loads |
| Output | Markdown summary in chat; progress.md |
| Fix scope | D-1, D-2, D-3 as written in the audit patch |

## Clarification log

- Q1: none. Scope taken from the approved audit findings; user asked to "update the things and the docs".
