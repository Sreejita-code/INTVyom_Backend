<!-- core-be:start -->
# AGENTS.md — Backend Engineering Rules

<!-- Managed by the core-backend skill pack (core-be-workflow, "Register the
pack"). Agents refresh the text between the core-be markers; edit the pack, not
this block. Repo-specific notes go outside the markers. -->

These rules apply to every agent working in this repository. They cover backend
services written in **Python** (FastAPI, async, uv) and **Node.js** (TypeScript,
Express / Fastify). Skills are installed as a Claude Code plugin, with
`npx skills`, or by copying `.agents/skills/`, so find each one by name. Read
the ones named here before you act.

> Talk first, plan first, then build. Simple, clean, verified code beats clever
> code. Tools enforce style; you enforce correctness, security, and scope.

## Load the skills before you act

This repo uses the `core-be-*` skills. Before any code change, load
`core-be-coding-standards`. For any non-trivial task, load `core-be-workflow`
first; it routes to the other skills. Find them by name (Claude Code plugin
skills appear as `core-backend:core-be-<skill>`).

Skills not installed? Tell the user and suggest one of:

```
/plugin marketplace add shubhamINT/agent_rules
/plugin install core-backend@int-agent-rules
```

```bash
npx skills add shubhamINT/agent_rules      # pick every core-be-* skill
```

Until they are installed, follow the rules in this file.

---

## 1. Always on — every task, however small

These apply to everything, including trivial edits and questions.

| Always-on skill | What it guarantees |
|-----------------|--------------------|
| `core-be-coding-standards` | Clean code, style, module design, the self-review for AI-generated code, and the **bug and smell radar** |
| `core-be-workflow` | Non-trivial work is recorded, scoped with the user, planned, and approved before any code changes |

Always-on behaviour:

1. **Converse before acting.** Understand what the user wants. If the request is
   ambiguous, ask — offer concrete options with a recommended default. Never
   guess scope.
2. **Plan before code** for anything non-trivial (§2). No source edits before
   the user approves the plan.
3. **Bug and smell radar.** While reading code for any reason, watch for bugs,
   security holes, and bad code. Explain each one to the user in plain terms —
   what, where (`file:line`), why it matters, how to fix it (name the fix or
   refactoring). Record it. Do not silently fix anything outside the agreed
   scope; offer a follow-up task. Report security holes immediately.
4. **Structure first.** Before placing or moving code, read the
   `## Project structure` section at the end of this file. If it is empty, run
   `core-be-structure-service`: detect the current structure, confirm it with the user,
   and record it there.
5. **Help the user understand.** Explain decisions and findings so a developer
   new to the code could follow and apply them. Prefer showing the fix over
   describing it.
6. **Spend tokens on evidence, not words.** Search before reading, read a
   file once, run one test file while iterating, filter logs before reading.
   Chat replies short; files in normal prose. Never skip a check to save
   tokens (`core-be-workflow/references/TOKEN-ECONOMY.md`).

## 2. Classify the task

| Task type | Examples | Skills |
|-----------|----------|--------|
| **Trivial** | answer a question, fix a typo, rename one variable, explain code | Just do it (always-on rules still apply, radar included). No tracking. |
| **Feature** | "add an endpoint", "support X", "integrate Y" | `core-be-workflow` → `core-be-build-feature` |
| **Refactor** | "clean this up", "this code is a mess", "restructure", "reduce duplication" | `core-be-workflow` → `core-be-refactor-code` |
| **Code audit** | "review this code", "check for bad code", "find bugs", "review what the AI wrote" | `core-be-workflow` → `core-be-audit-code` |
| **Security audit** | "security audit", "find vulnerabilities", "is this safe", "OWASP check" | `core-be-workflow` → `core-be-audit-security` |
| **Tests** | "add tests", "raise coverage", "fix the failing suite" | `core-be-workflow` → `core-be-write-tests` |
| **Debug** | "this returns 500", "flaky test", "worked yesterday", "users see wrong data", "it's slow", a pasted stack trace | `core-be-workflow` → `core-be-debug` |
| **Structure** | "structure this repo", "where should this go", "which architecture" | `core-be-workflow` → `core-be-structure-service` |
| **Health endpoint** | "add a health check", "readiness probe" | `core-be-workflow` → `core-be-add-health-endpoint` |

Unsure whether a task is trivial? Treat it as non-trivial. A change that touches
more than one file, any trust boundary (auth, input parsing, external calls,
secrets), or any public interface is never trivial.

## 3. The non-trivial workflow (mandatory)

Follow the `core-be-workflow` skill. In short:

1. **Record first.** Create `agent-tracking/` if missing and write the user's
   request verbatim to `agent-tracking/plans/<slug>/scope.md`, plus a row in
   `agent-tracking/INDEX.md`. Everything after — questions, answers, research,
   plan, progress, report — lands in the same folder.
2. **Scope with the user.** Ask until it is unambiguous: which paths, how deep,
   what is out of scope, constraints, success criteria, and the report format
   (**HTML by default, or Markdown**). Log questions and answers in `scope.md`.
   Reports are visual: a Current → Target diagram for every change
   (`core-be-workflow/references/VISUAL-REPORT.md`). Audit and security reports load no
   external scripts.
3. **Research**, then **plan**: write `plan.md`, show it, and wait for explicit
   approval.
4. **Execute the approved plan only.** Log each step in `progress.md`. New scope
   found mid-task: stop, record it, ask.
5. **Report** into `agent-tracking/reports/` and update `INDEX.md`.

**Think like the senior engineer on call for it.** Features get a system design
pass (`core-be-build-feature/references/system-design.md`): concurrency,
idempotency, failure modes, limits, compatibility — sized to the real risk.
Every code change ships in small reversible steps with a concrete rollback
(`core-be-workflow/references/SAFE-DELIVERY.md`).

**Use subagents where they add independence or parallelism**
(`core-be-workflow/references/SUBAGENTS.md`): read-only `investigator`s for
audit fan-out and debugging hypotheses, a `test-writer` that writes tests from
the contract, and a fresh-context `reviewer` before every report. Brief a
general-purpose subagent with the role text from `SUBAGENTS.md`. Verify what
they return.

`agent-tracking/` belongs in version control, but the user commits it — see rule 12.

## 4. Coding rules

1. **Read before you change.** Never edit code you have not read. Follow the
   repo's existing patterns and recorded structure.
2. **Simplest thing that works.** No speculative abstractions, config options, or
   layers "for later". Delete dead code; never leave commented-out blocks.
3. **Never invent an API.** Every import, package, function, method, flag, and
   config key must exist in the installed version. Verify in the lockfile and
   the package source or official docs. Never add a dependency you have not
   confirmed exists under that exact name.
4. **Handle errors explicitly.** No bare `except:` / empty `catch {}`. Fail
   closed at trust boundaries; degrade gracefully only where the contract says so.
5. **Validate all external input** (bodies, headers, query params, files, env,
   upstream responses) with a schema: pydantic (Python) or zod (Node).
6. **No secrets in code, logs, errors, or tests.** One settings module reads the
   environment; `.env.example` lists every variable with safe placeholders.
7. **Every outbound call has a timeout. Every query is parameterised. Every
   resource-scoped read checks ownership.**
8. **Tests ship with the change** and pass offline. Coverage floor 80%; never
   lower it, never loosen an assertion to go green.
9. **Docs stay true.** README endpoint, env, and structure sections change in
   the same change as the code.
10. **Do not reformat code you did not otherwise change.** Keep diffs reviewable.
11. **No git side effects unless asked.** Do not commit, branch, push, or delete
    lockfiles. Leave changes in the working tree for the user to review.
12. **Parallel agents share one board.** When other agents work here too, join
    `agent-tracking/board/` with `core-be-workflow/scripts/board.sh`: claim a
    task and lock its files before editing, never wait by re-reading code, and
    `leave` when done. The last agent out removes the board
    (`core-be-workflow/references/PARALLEL-AGENTS.md`).

## 5. Language baselines

| | Python | Node.js |
|--|--------|---------|
| Runtime | Python 3.12+, `uv` | Node 24 LTS, TypeScript `strict` |
| Style guide | Google Python Style Guide | Google TypeScript Style Guide |
| Format + lint | Ruff (`ruff format`, `ruff check`) | Prettier + ESLint 9 flat config + typescript-eslint |
| Types | mypy or pyright, strict on new code | `tsc --noEmit`, no `any` |
| Security lint | Ruff `S` rules, Semgrep | eslint-plugin-security, Semgrep |
| Dependencies | `pip-audit` | `npm audit` / `pnpm audit` |
| Secrets | gitleaks | gitleaks |
| Complexity | Ruff `C901`, max 10 | ESLint `complexity`, max 10 |
| Tests | pytest (`core-be-write-tests`) | vitest (`core-be-write-tests`) |

Every section of the Google Python, TypeScript and JavaScript style guides is
indexed (enforced by tool / rule / override) in
`references/{python,typescript,javascript}-style.md` of the
`core-be-coding-standards` skill; the full guides are bundled in its
`references/google/`.

## 6. Skill index

| Skill | Kind | Use when |
|-------|------|----------|
| `core-be-coding-standards` | always on | Writing, changing, or judging any code |
| `core-be-workflow` | always on | Any non-trivial task: record, scope, plan, approve, report |
| `core-be-build-feature` | task | Building new behaviour |
| `core-be-refactor-code` | task | Changing structure without changing behaviour; architecture review |
| `core-be-audit-code` | task | Finding bugs, bad code, weak tests, AI-generated-code failures |
| `core-be-audit-security` | task | Finding vulnerabilities (OWASP, ASVS, CWE) |
| `core-be-write-tests` | task | Writing or fixing tests; coverage |
| `core-be-debug` | task | Reproducing, root-causing, and fixing bugs, flaky tests, slowness |
| `core-be-structure-service` | task | Detecting, choosing, recording, applying the project structure |
| `core-be-add-health-endpoint` | task | Adding or fixing `GET /health` |
<!-- core-be:end -->

# Repository rules

Everything below is owned by this repo. `CLAUDE.md` only imports this file, so there is one
copy of every rule. `README.md` is the developer guide (setup, endpoints, data stores); this
file is for agents.

This is an Express + MongoDB proxy in front of the LiveKit Agents REST API. The
`api-livekit-docs` MCP server is the authoritative source for every upstream endpoint, field
name and default. Treat this repo's own docs as possibly stale.

## Deviations from the pack

Where the pack text above and this section disagree, this section wins.

- CommonJS JavaScript, not TypeScript or Python: `src/server.js`, `src/index.js`, `npm`,
  `node --test`. No ESM, no `tsc`. Validation uses `zod`.
- The test runner is `node --test` with `supertest` and `proxyquire`, not vitest. No coverage
  floor is enforced; every behaviour change still ships a test.
- No `LICENSE` / `NOTICE` / `THIRD_PARTY_LICENSES.md` and no per-file licence headers. This
  repo is not distributed. Do not add them.
- One-time migration scripts are deleted once they have run in production. The README
  "Applied migrations" table is the record. Do not re-add them to `scripts/`.
- The workflow's `agent-tracking/` records replace any separate task list. Keep `INDEX.md`
  and each task's `progress.md` honest as you go.

## Orient against the upstream docs

Never plan from memory. Use the `api-livekit-docs` MCP server: `list_docs` to see pages,
`search_docs` when you know roughly what you want, `get_doc` to read one in full.

Never guess an upstream path, field name, default or payload shape. If you did not read it in
a doc page this session, you do not know it. Then read the local code the change touches and
follow the sibling that already solves a similar problem.

For a broad drift sweep, dispatch read-only subagents with one doc area and its backend files
each, and ask for a structured finding list. Their findings are leads: verify against the docs
yourself before changing code.

## Ask, plan, then build

- Ask the user only when different answers produce materially different code: a contract
  question with no safe default, a strictness-vs-compatibility trade-off, or a change that
  could break existing users irreversibly. Use `AskUserQuestion`, lead with a recommendation,
  say what each option costs, and batch questions into one round. For ordinary judgment
  calls, decide, state the assumption, and continue.
- The plan states the gap (with evidence), the steps (file by file), and what you are
  deliberately not doing. The last part is mandatory: it is how the user disagrees cheaply.
  Show it and wait for approval before editing.
- Trivial work (typo, one-line fix, comment, obvious rename) skips all of this. Do it and say
  what you did.

## Verify as you go

After each step that changes behaviour:

```bash
npm test                                   # green the whole way, not just at the end
node --check <changed-file>
node scripts/check-assistant-payload.js    # when assistant payload rules changed
node src/integration/providers.js          # when the provider/key map changed
node -e "const y=require('yamljs');y.load('swagger.yaml')"   # after editing swagger.yaml
```

When an existing test fails, decide which it is and say so in the report: the test is right
and the code is wrong (fix the code), or the contract genuinely changed (update the test and
explain the change in a comment). Never delete or weaken a test to make a change pass.

Non-trivial logic leaves one runnable check behind: a `node --test` file under `tests/`
mirroring `src/`, or an `assert`-based self-check under `require.main === module` for pure
helpers. No new frameworks.

## Protect existing users

This backend has live users with stored assistants, trunks and integrations. Before shipping
any validation, default or contract change, ask what it does to data that already exists.

- A new rejection must not lock a user out of a record they need to repair. If an old
  configuration is now invalid, the edit path that fixes it keeps working.
- A changed default silently rewrites behaviour for everyone who relied on the old one.
  Usually keep the local default and document the divergence from upstream.
- Local mirror and upstream must not drift. When an operation spans both, call upstream first
  and touch local state only after it succeeded. Treat "already in the desired state"
  (404/400) separately from real failures.
- Migrations for existing rows are part of the change, not a follow-up.

When strictness and compatibility cannot both hold, say so in the plan and let the user pick.

## Documentation ships in the same change

- `swagger.yaml`: request/response schemas, enums, per-field descriptions, new paths.
- `README.md`: endpoint lists, reference tables, behavioural notes, project structure.
- `AGENTS.md`: only when a convention itself changed. `CLAUDE.md` is never edited.

Document the traps, not just the fields: a default that is not what its name suggests, two
providers that spell the same knob differently, an omission that does not mean what a reader
assumes.

## Report honestly

Say what shipped (grouped by theme), what you deliberately did not do and why, anything found
but not fixed, and real verification output. If a test fails, show the failing line. If a
step was skipped, say so. If the task as specified has a real problem, state it in a sentence
or two and deliver under a stated assumption; scaling the work down is the user's call.

## Conventions

- Express routes live in `src/api/routes/`; business logic in `src/<domain>/`; external HTTP
  clients in `src/services/<upstream>/`; DB access in `src/core/db/`.
- Identity comes from `req.user`, set by `src/core/middleware/requireAuth.js` from the
  `Authorization: Bearer <api_key>` header. Routes never read identity from the payload: a
  `user_id` in the body or query string is ignored. Only `POST /api/auth/signup` and
  `POST /api/auth/login` are unauthenticated.
- All configuration is read in `src/core/config.js`. Never `process.env` elsewhere.
- Error handling is centralized: handlers delegate failures via `next(err)`, and
  `src/core/middleware/errorHandler.js` shapes every error response. No hand-rolled
  `res.status(...).json({ error })` in handlers.
- Logging goes through `getLogger(module)` from `src/core/logging/logger.js`. No `console.*`
  in application code, and never log an upstream response body: they carry API keys.
- `axios` is confined to `src/services/`; domains call `callExternal` instead.
- Tests use `node --test` and mirror `src/` under `tests/`.
- Run `npm test` and `node --check` on changed files before finishing.

## Project structure

Pattern: layered, grouped by domain. The full annotated tree is in `README.md` →
"Project Structure"; update both in the same change when folders move.

| Layer | Path | Rule |
|-------|------|------|
| HTTP surface | `src/api/routes/` | Validate, delegate, shape. No queries, no external calls. |
| Domain logic | `src/<domain>/` | Business logic and orchestration. |
| External I/O | `src/services/<upstream>/` | The only place `axios` appears. |
| Infrastructure | `src/core/` | Config, DB, middleware, logging. The only place `process.env` is read. |
| Tests | `tests/` | Mirrors `src/`. |
| Scripts | `scripts/` | Read-only audits and self-checks; migrations are deleted after they run. |
