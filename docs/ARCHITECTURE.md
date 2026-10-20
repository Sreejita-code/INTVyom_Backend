# Architecture

Express + MongoDB service in front of the upstream LiveKit Agents REST API. It authenticates the
caller, keeps a local record of what each user owns, and forwards the real work upstream with that
user's key. Layered, grouped by domain. How to call it: `swagger.yaml`. How it talks to LiveKit:
[UPSTREAM](UPSTREAM.md). What it stores: [DATA](DATA.md).

## Request path

```text
client ──HTTP──> src/server.js ──> requireAuth (Bearer key -> req.user)
                                      │
                       src/api/routes/<group>.routes.js   validate, delegate, shape
                                      │
                           src/<domain>/*.service.js      rules, orchestration
                              │                    │
              src/services/livekit (callExternal)   src/core/db (Mongoose)
                              │
                   upstream LiveKit Agents API
```

`/api-docs` (Swagger UI) and `/mcp` (docs MCP) are mounted before `requireAuth` and are public.

## Layers

| Layer | Path | Rule |
|---|---|---|
| HTTP surface | `src/api/routes/` | Validate, delegate, shape. No queries, no external calls. |
| Domain logic | `src/<domain>/` | Business rules and orchestration. |
| External I/O | `src/services/<upstream>/` | The only place `axios` appears. |
| Infrastructure | `src/core/` | Config, DB, middleware, logging. The only place `process.env` is read. |

Cross-cutting rules: handlers throw and never build error bodies; logging goes through
`getLogger(module)` (no `console.*`), and an upstream response body is never logged because it can
carry API keys.

## Response envelope

Success responses keep their per-endpoint shape, so existing clients keep working. Most are `{ success, message, data }`, some proxy the upstream body verbatim.

Every failure returns the same shape, built centrally by `src/core/middleware/errorHandler.js`:

```json
{ "error": "Assistant not found" }
```

- The status comes from `err.status` (validation `400`, upstream `4xx` passed through) and falls
  back to `500`. Unknown non-`/api` routes answer `404`; an unknown `/api/...` path answers `401`
  first, because `requireAuth` runs before the routers.
- Assistant create/update validation failures (`400`) add `suggestions` next to `error` — the
  same hints `POST /api/assistant/validate` returns in `data.suggestions`. It is an **object
  keyed by slot, not an array**, and only the keys that apply are present:
  `{ "llm": "Try: openai", "llm_notes": "Gemini is not supported in cascade mode - ..." }`
  (keys: `llm`, `stt`, `tts`, `llm_notes`, `stt_notes`, `tts_notes`).
- Analytics endpoints forward the upstream error body verbatim instead, via `err.payload`.
- Route handlers never build error bodies — they `throw` and land in the central handler.

## Project structure

```text
INTVyom_Backend/
├── README.md
├── package.json
├── Dockerfile
├── docker-compose.yml
├── deploy.sh
├── .env.example
├── AGENTS.md                 # rules for AI agents (CLAUDE.md just imports it)
├── swagger.yaml
├── docs/                     # developer docs (this folder), served by the MCP dev-doc tools
├── agent-tracking/           # per-task scope, plan, progress and reports from agent work
├── scripts/                  # one-off migrations and self-checks
│   ├── audit-assistant-models.js     # read-only: lists stored assistants on retired model ids
│   ├── migrate-retired-models.js     # one-time: moves gpt-5.1 / gpt-5.4-nano assistants to gpt-6-sol / gpt-6-luna
│   ├── check-assistant-payload.js    # self-check for assistant payload rules
│   └── audit-duplicate-usernames.js  # read-only: lists users sharing a user_name (blocks the unique index)
├── tests/                    # node --test suite, mirrors src/
└── src/
    ├── index.js              # runner: config → connectDB → listen
    ├── server.js             # wiring only: middleware, swagger, route mounts, error handlers
    ├── api/
    │   └── routes/           # one thin module per endpoint group (validation + delegation)
    │       └── common.js     # route-level error-status helpers
    ├── assistant/            # domain: orchestration + payload rules/builders + xlsx export
    │   ├── assistant.service.js  # create/list/details/delete + public surface for the rest
    │   ├── assistant.update.js   # update flow: target mode, upstream patch, local mirror
    │   ├── assistant.billing.js  # call logs + billable-minute aggregation (paged, bounded fan-out)
    │   ├── assistant.rules.js    # ASSISTANT_FIELDS, mode inference, pair resolution (pure)
    │   ├── assistant.validation.js  # zod schemas + model/provider validation
    │   ├── tts-rules.js          # per-provider TTS model/voice/language rules (pure)
    │   ├── wizard.service.js     # guided assistant creation
    │   ├── template.service.js   # starter templates (templates/)
    │   ├── assistant.builder.js  # TTS/STT/LLM config construction + key resolution
    │   ├── assistant.resync.js   # key-rotation re-sync job
    │   └── exporter.js       # platform-wise billable minutes xlsx workbook
    ├── auth/                 # domain: signup/login (issues the upstream key) + userAccess guard
    ├── integration/          # domain: provider map (providers.js) + key storage/re-sync
    ├── analytics/            # domain: analytics proxy
    ├── call/                 # domain: outbound call trigger
    ├── audio/                # domain: audio library proxy
    ├── sip/                  # domain: SIP trunk CRUD
    ├── tool/                 # domain: tool CRUD + attach/detach
    ├── webcall/              # domain: web-call token
    ├── inbound/              # domain: inbound mapping CRUD
    ├── inbound-context-strategy/  # domain: context strategy CRUD
    ├── passthrough/          # domain: web-to-SIP passthrough calls
    ├── meeting/              # domain: Google Meet integration
    ├── mcp/                  # docs MCP (swagger + docs/, never calls the API), mounted at /mcp
    │   ├── swagger-index.js  # pure: $ref resolution, examples, endpoint search
    │   ├── dev-docs.js       # loads docs/*.md once at startup; lookups by file name only
    │   └── swagger-mcp.js    # Streamable HTTP router + the eight docs-only tools
    ├── services/
    │   └── livekit/          # the ONLY external HTTP client (callExternal) — axios lives here
    │       └── livekitService.js
    └── core/
        ├── config.js         # Settings singleton — the only place process.env is read
        ├── async/mapLimit.js # bounded-concurrency map, ordered results (billing fan-out)
        ├── db/
        │   ├── dbConnect.js
        │   ├── schemas/      # one mongoose model per file (user, assistant, sip, tool, ...)
        │   └── functions/    # query helpers (findByLocalOrExternalId)
        ├── middleware/
        │   ├── asyncHandler.js
        │   ├── errorHandler.js   # one response shape for every error path
        │   ├── requireAuth.js    # Authorization: Bearer <api_key> → req.user, on every /api route except /api/auth
        │   └── notFound.js
        └── logging/logger.js
```

## Billable minutes is the expensive endpoint

Upstream has no billable-minutes aggregate, so `GET /api/assistant/platform-billable-minutes`
builds one here: every assistant the user owns, every page of its call logs at 100 rows a page.
Cost grows with account history, and with no `start_date`/`end_date` the window is the user's whole
lifetime. Two things keep it honest:

- The fan-out runs through `mapLimit` at `ASSISTANT_CONCURRENCY` × `PAGE_CONCURRENCY` (5 × 5) rather
  than serially. Page 1 is still fetched first — it is what reports `total_pages`.
- A per-assistant read failure is skipped, not fatal, so the response reports
  `assistants_evaluated` / `assistants_skipped` and says so in `message`. A partial total presented
  as a complete one is the failure mode worth guarding here.

If it ever needs to be faster than this, the next step is a cache keyed on user + date window — not
a bigger concurrency number.
