# INTVoicekit Backend

Express + MongoDB backend for INTVoicekit voice assistant operations.

This service:
- Manages local user and resource records in MongoDB.
- Proxies most assistant-related operations to the upstream LiveKit Agents API.
- Exposes module-based REST endpoints under `/api/*`.

## Tech Stack

- Node.js (CommonJS)
- Express
- Mongoose
- Axios (only inside `src/services/`)
- Docker / Docker Compose

## Prerequisites

- Node.js 20+
- npm
- MongoDB URI (Atlas or self-hosted)
- Optional: Docker and Docker Compose

## Environment Variables

Create `.env` in the project root (already ignored by git):

```env
PORT=3000
MONGO_URI=mongodb+srv://<username>:<password>@<cluster-url>/intvoicekit?retryWrites=true&w=majority
```

Every variable the runtime reads — all of them in `src/core/config.js`, mirrored by
`.env.example`:

| Variable | Default | Note |
|---|---|---|
| `PORT` | `3000` | HTTP listen port |
| `MONGO_URI` | none (required) | MongoDB connection string |
| `EXTERNAL_API_BASE` | `https://api-livekit-vyom.indusnettechnologies.com` | LiveKit Agents host; override for staging or a local mock |
| `DNS_SERVERS` | unset (system resolver) | Comma-separated resolvers applied before the MongoDB connect, e.g. `8.8.8.8,1.1.1.1`. Only for machines whose resolver cannot look up the `mongodb+srv` record (seen on WSL). Leave unset in deploys: it replaces DNS for the whole process, so private/VPC hostnames stop resolving |

Notes:
- Provider keys (TTS: `sarvam`/`cartesia`/`elevenlabs`/`mistral`, STT: `sarvam`/`cartesia`/`deepgram`/`elevenlabs`/`openai`, LLM: `openai`/`gemini`) are stored through integration APIs, not read from process env. Several vendors share one row across slots — see [docs/ASSISTANT-RULES.md](docs/ASSISTANT-RULES.md).
- `src/integration/providers.js` is the single source of truth for which `service_name` row holds which key. Adding a provider means one entry there, not a grep across modules. Run `node src/integration/providers.js` for its self-check.
- Assistant payload rules (TTS/STT pairing, mode inference, field whitelist) have their own
  self-check: `node scripts/check-assistant-payload.js`. No DB or network needed.

## Run Locally

```bash
npm install
npm start          # or: npm run dev — same thing, restarts on file changes
```

Server starts on `http://localhost:3000` by default.

## Run With Docker Compose

```bash
docker compose build --no-cache api
docker compose up -d
docker compose ps
docker compose logs -f api
```

Stop:

```bash
docker compose down
```

If your machine uses legacy Compose, replace `docker compose` with `docker-compose`.

## Deployment Script

`deploy.sh` performs:
1. `.env` existence check
2. `git pull origin main`
3. `docker compose up -d --build`
4. `docker system prune -a -f`

Run:

```bash
chmod +x deploy.sh
./deploy.sh
```

Note: `docker system prune -a -f` removes unused images and caches across Docker.

## API Base URL

All routes are mounted under:

```text
/api
```

## Documentation

| You want to | Read |
|---|---|
| Run the service | this README |
| Understand the code: layers, how it uses the upstream LiveKit API, data, conventions | [`docs/`](docs/): `ARCHITECTURE.md`, `UPSTREAM.md`, `DATA.md`, `ASSISTANT-RULES.md`, `DEVELOPING.md`, `CHANGELOG.md` |
| Call the API: endpoints, payloads, responses | Swagger UI at `/api-docs`, or the MCP server below |

### MCP server for agents

The backend serves its API contract and developer docs over MCP at `/mcp` (Streamable HTTP), so
a frontend agent can read payloads, responses, internals and recent changes instead of
hand-copying from `swagger.yaml`. **It is documentation only**: it never calls the API, never
touches MongoDB and holds no credentials. To make a request, the agent sends HTTP itself with
`Authorization: Bearer <api_key>`. It is stateless and unauthenticated, like `/api-docs`.

Point the frontend repo's `.mcp.json` at it:

```json
{ "mcpServers": { "intvoicekit-api-docs": { "type": "http", "url": "http://localhost:3000/mcp" } } }
```

Eight tools: `get_overview`, `list_endpoints`, `search_endpoints`, `get_endpoint`, `get_schema`
(from `swagger.yaml`), `list_dev_docs`, `get_dev_doc` (from `docs/`) and `get_changelog`
(`docs/CHANGELOG.md`, breaking changes flagged).

Both `swagger.yaml` and `docs/` are read once at process start: edit, then restart. The server serves
them verbatim, so stale files mean a confidently stale agent. `tests/api/swagger.test.js` fails when a
mounted route and `swagger.yaml` disagree. `docs/` is public, so it holds no secrets.

## Authentication

**Breaking change (2026-09-22): every endpoint now requires a bearer key.** All routes except
`POST /api/auth/signup` and `POST /api/auth/login` require the user's **VoiceKit API key** (the `api_key` field) in an
`Authorization: Bearer <api_key>` header; a missing or unknown key is a `401`. Obtain the key from
signup or login. The key string is issued upstream; older keys may still start with a `vyom_`
prefix — it is the same VoiceKit API key, nothing to change. Identity comes from that key — a `user_id` in the body or query string is ignored,
and no longer selects the tenant.

Clients on the old unauthenticated path (`user_id` in the payload, no header) receive `401` until
they send the header. A user whose `api_key` is `null` (upstream issuance failed at signup) cannot
authenticate at all and now gets `401` instead of the old `400`.

## Scripts

- `npm start` - Start API server.
- `npm run dev` - Same, with `node --watch` auto-restart.
- `npm test` - Run the `node --test` suite under `tests/`.
- `node scripts/check-assistant-payload.js` - Self-check for assistant payload rules.
- `node src/integration/providers.js` - Self-check for the provider key map.
- `node scripts/audit-assistant-models.js` - Read-only. Lists stored assistants holding values
  upstream now rejects (dead models, retired `gpt-5.1` / `gpt-5.4-nano`, bad Sarvam speakers or
  languages, ElevenLabs settings the model ignores). Exit code 1 means findings.
- `node scripts/migrate-retired-models.js` - One-time. Dry run lists assistants on `gpt-5.1` /
  `gpt-5.4-nano` (also as duplex `backend_model`); `--apply` PATCHes each upstream to `gpt-6-sol` /
  `gpt-6-luna` and only then updates the local mirror. Idempotent. Not yet applied: once it has
  run in production, delete it and add it to "Applied migrations" below.
- `node scripts/audit-duplicate-usernames.js` - Read-only. Lists users sharing a `user_name`.
  **Run it before deploying the unique `user_name` index:** Mongoose builds that index at
  startup and the build fails while duplicates exist, leaving the name unprotected. Mongoose
  itself swallows that failure; `user.model.js` logs it as `users index build failed`. Rename all but one user per group, then restart. Exit code 1 means duplicates.

### Applied migrations

These one-time scripts have run against production and were deleted afterwards — the schema
they produced is the current one, so nothing needs re-running. Recover any of them from git
history (`git log --diff-filter=D -- scripts/`) if an old database ever has to be brought forward.

| Script | What it did |
|---|---|
| `migrate-stt-config.js` | dropped `interaction_config.user_stt_provider` / `.stt_api_key`, rewrote `stt_model: "openai"` (which then *meant* native; `openai` is now a real cascade STT provider again, so post-migration rows selecting it are genuine selections, not leftovers) |
| `migrate-tts-field-names.js` | renamed assistant `model` / `config` to `tts_model` / `tts_config` |
| `backfill-llm-provider.js` | set `llm_provider` from `llm_config.provider`, defaulting to `openai` |
| `drop-sarvam-stt-rows.js` | removed unreachable `sarvam_stt` integration rows and their re-sync jobs |
