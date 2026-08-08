# CLAUDE.md

The working process for AI agents in this repository. `AGENTS.md` says *what the code must look
like*; this file says *how to get there*. Read both before starting.

This is an Express + MongoDB proxy in front of the LiveKit Agents REST API. The
`api-livekit-docs` MCP server is the authoritative source for every upstream endpoint, field
name and default — **never guess an upstream contract**, and treat this repo's own docs as
possibly stale.

---

## 0. Does this apply?

**Yes** for non-trivial work: multi-file changes, new features or endpoints, anything touching
the upstream API contract, schema changes, anything you cannot hold in your head at once.

**No** for trivial work: a typo, a one-line fix, a comment, a rename with an obvious blast
radius. Do those directly and say what you did. A process everybody rubber-stamps is worse than
no process — do not manufacture a five-phase plan for a two-word change.

When genuinely unsure which side you are on, spend two minutes orienting (phase 1). That is
usually enough to tell.

---

## 1. Orient before proposing anything

Never plan from memory or assumption. Establish the facts first.

The upstream API docs are authoritative. Use the `api-livekit-docs` MCP server:

- `list_docs` to see what pages exist
- `search_docs` when you know roughly what you want
- `get_doc` to read a page in full

**Never guess an upstream path, field name or payload shape.** If you did not read it in a doc
page this session, you do not know it. Local code and this repo's own README can be stale — the
whole reason a task lands here is usually that they *are*.

Then read the local code the change touches. Look for the sibling that already solves a similar
problem and follow it; this repo has strong conventions and consistency beats cleverness.

For a broad sweep — "what else is out of date?", "which endpoints drifted?" — dispatch subagents
in parallel with tightly scoped briefs (one doc area and its matching backend files each), and
ask for a structured finding list rather than prose. Verify anything you intend to act on
against the docs yourself before changing code; subagent findings are leads, not facts.

---

## 2. Ask only what changes the work

Ask the user when different answers produce materially different code. Typical triggers:

- A contract question with no safe default ("does this endpoint keep its old status code?")
- A trade-off the user owns (strictness vs. compatibility, local validation vs. passthrough)
- Anything that risks breaking existing users in a way you cannot reverse

Do **not** ask about things you can determine yourself, and do not ask permission to think.
For ordinary judgment calls: make the call, state it as an assumption, keep moving.

When you do ask, use `AskUserQuestion` with concrete options, lead with your recommendation, and
say what each choice costs. Batch related questions into one round — do not interrogate the user
one question at a time. Ask **before** finalizing the plan, not after.

---

## 3. Write the plan and show it before implementing

The plan is a short document, not a paragraph of intent. It states:

- **The gap** — what is actually wrong or missing, in specifics, with evidence from phase 1
- **The steps** — file by file, in order, each one a thing you could hand to someone else
- **What you are deliberately NOT doing** — and why

That last section is not optional. It is where scope creep goes to die, and it is what the user
most needs to see in order to disagree with you cheaply.

Show the plan and wait. Do not start editing during the same turn you present it.

---

## 4. Track the work

Once the plan is approved, put the steps into the task list (`TaskCreate`), and keep it honest
as you go (`TaskUpdate`: `in_progress` when you pick a step up, `completed` when it is done and
verified). One task per plan step.

This is for the user's visibility as much as yours: a stale or decorative task list is worse
than none. If the plan changes mid-flight, update the list and say so.

---

## 5. Implement step by step, verifying as you go

Work one step at a time. After each step that changes behavior:

```bash
npm test                                   # must stay green the whole way, not just at the end
node --check <changed-file>
node scripts/check-assistant-payload.js    # when you touched assistant payload rules
node src/integration/providers.js          # when you touched the provider/key map
node -e "const y=require('yamljs');y.load('swagger.yaml')"   # after editing swagger.yaml
```

When an existing test fails, decide deliberately which of these it is, and say which in the
commit or your report:

- **The test is right and the code is wrong** — fix the code.
- **The contract genuinely changed** — update the test *and* explain the change in its comment,
  so the next reader knows it was intentional rather than convenient.

Never delete or weaken a test to make a change pass.

Non-trivial logic leaves one runnable check behind — the smallest thing that fails if the logic
breaks. Follow the existing patterns: `node --test` files under `tests/` mirroring `src/`, or an
`assert`-based self-check under `require.main === module` for pure helpers. No new frameworks.

---

## 6. Protect existing users

This backend has live users with stored assistants, trunks and integrations. Before shipping any
validation, default or contract change, ask what it does to data that already exists.

- A new rejection must not lock a user out of a record they need to *repair*. If an old
  configuration is now invalid, the edit path that fixes it has to keep working.
- A changed default silently rewrites behavior for everyone who relied on the old one. Usually
  the right move is to keep the local default and document the divergence from upstream.
- Local mirror and upstream must not drift. When an operation spans both, do the upstream call
  first and only touch local state once it succeeded — and think about the "already in the
  desired state" case (404/400) separately from real failures.
- Migrations for existing rows are part of the change, not a follow-up.

When you cannot have both strictness and compatibility, say so in the plan and let the user pick.

---

## 7. Documentation ships in the same change

A change is not done until the docs match it. In this repo that means:

- `swagger.yaml` — request/response schemas, enums, per-field descriptions, new paths
- `README.md` — endpoint lists, reference tables, behavioral notes
- `AGENTS.md` — only if a convention itself changed

Document the traps, not just the fields. A field list a reader can infer from the schema is
worth less than one sentence about the thing that will bite them (a default that is not what the
name suggests, two providers that spell the same knob differently, an omission that does not
mean what they assume).

---

## 8. Report honestly

Close with what actually happened:

- What shipped, grouped by theme rather than by file
- What you deliberately did not do, and why — especially compatibility calls
- Anything you found but did not fix, so the user can decide
- Real verification output. If tests fail, say so and show the failing line. If a step was
  skipped, say that. Never report "done" for something you did not run.

If you discovered a genuine problem with the task as specified, say it in a sentence or two and
then deliver the work anyway under a stated assumption. Scaling the work down is the user's call.

---

## Skills and tools

- **`node-service-structure`** and **`coding-skills`** are mandatory for any coding task here —
  see `AGENTS.md`. Layout and layering questions are answered by the skill, not by taste.
- **`api-livekit-docs` MCP** is the upstream contract. Phase 1 covers it.
- **Subagents** for parallel read-only investigation across many files. Give each a narrow scope
  and a structured output format. Verify before acting on findings.
- **`AskUserQuestion`** for the decisions in phase 2.
- **`TaskCreate` / `TaskUpdate`** for phase 4.

---

## The short version

> Read the upstream docs. Ask only what changes the work. Show a plan that says what you are
> *not* doing. Track the steps. Implement one at a time, green the whole way. Do not break
> existing users. Ship the docs with the code. Report what really happened.
