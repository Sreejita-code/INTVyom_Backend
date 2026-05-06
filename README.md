# INTVyom Backend

Express + MongoDB backend for INTVyom voice assistant operations.

This service:
- Manages local user and resource records in MongoDB.
- Proxies most assistant-related operations to the external Vyom API.
- Exposes module-based REST endpoints under `/api/*`.

## Tech Stack

- Node.js (CommonJS)
- Express
- Mongoose
- Axios
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
MONGO_URI=mongodb+srv://<username>:<password>@<cluster-url>/intvyom?retryWrites=true&w=majority
```

Notes:
- Runtime code directly reads only `PORT` and `MONGO_URI`.
- Provider keys (for services like Sarvam/Cartesia/ElevenLabs/Mistral) are stored through integration APIs, not read from process env.

## Run Locally

```bash
npm install
npm start
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

## API Endpoints

Most endpoints require `user_id` in either query params or request body.

### Auth (`/api/auth`)

- `POST /signup` - Register user and attempt external key creation.
- `GET /get_api?user_name=...` - Fetch stored API key by username.
- `POST /login` - Login with `user_name` and `password`.

### Assistant (`/api/assistant`)

- `POST /create` - Create assistant.
- `GET /list?user_id=...` - List assistants.
- `GET /details/:id?user_id=...` - Assistant details.
- `PATCH /update/:id` - Update assistant (`user_id` in body).
- `DELETE /delete/:id` - Delete assistant (`user_id` in query/body).
- `GET /call-logs/:id?user_id=...` - Assistant call logs.

Mode-aware fields for create/update:
- `assistant_llm_mode`: `pipeline` (default) or `realtime`.
- `assistant_llm_config`: Realtime config object (used when mode is `realtime`).
- `assistant_tts_model` and `assistant_tts_config`: Pipeline TTS fields (used when mode is `pipeline`).

Realtime mode behavior:
- `assistant_llm_config.provider = gemini` key resolution order:
  1. `assistant_llm_config.api_key` from request
  2. Integration key with `service_name=gemini`
  3. Error if neither is available
- `assistant_interaction_config.filler_words` is always forced to `false`.
- Pipeline-only TTS fields are ignored/stripped when sending realtime updates.

### SIP (`/api/sip`)

- `POST /create-outbound-trunk` - Create SIP trunk. Pass `passthrough_mode: true` to create a passthrough-only trunk. Optionally pass `passthrough_webhook_url` to receive end-of-call notifications.
- `GET /list?user_id=...` - List SIP trunks.
- `GET /details/:id?user_id=...` - SIP trunk details.
- `DELETE /delete/:id` - Delete SIP trunk (`user_id` in query/body).

### Call (`/api/call`)

- `POST /outbound` - Trigger outbound call.

### Integration (`/api/integration`)

- `POST /store` - Store or update provider API key.
- `GET /get?user_id=...&service_name=...` - Retrieve provider API key.

### Tool (`/api/tool`)

- `POST /create` - Create tool.
- `GET /list?user_id=...` - List tools.
- `GET /details/:id?user_id=...` - Tool details.
- `PATCH /update/:id` - Update tool (`user_id` in body).
- `DELETE /delete/:id` - Delete tool (`user_id` in query/body).
- `POST /attach/:assistant_id` - Attach tools to assistant.
- `POST /detach/:assistant_id` - Detach tools from assistant.

### Web Call (`/api/web-call`)

- `POST /get-token` - Generate web call token (AI agent call). Body: `user_id`, `assistant_id`, `metadata?`.

### Passthrough Call (`/api/passthrough-call`)

Human web-to-SIP calls with no AI agent. Web browser speaks directly to phone caller over SIP — no STT, LLM, or TTS involved.

Prerequisites: a SIP trunk created with `passthrough_mode: true`.

- `POST /passthrough-outbound` - Trigger passthrough call. Body: `user_id`, `trunk_id`, `to_number`, `metadata?`. Returns `room_token` (use with LiveKit JS/React SDK to connect browser), `room_name`, `queue_id`, `status`.
- `GET /call-records?user_id=...` - List passthrough call records. Optional filters: `to_number`, `call_status`, `start_date`, `end_date`, `limit`, `offset`.

### Inbound (`/api/inbound`)

- `POST /assign` - Assign inbound number.
- `GET /list?user_id=...` - List inbound mappings.
- `PATCH /update/:id` - Update inbound mapping (`user_id` in body).
- `POST /detach/:id` - Detach inbound mapping (`user_id` in query/body).
- `DELETE /delete/:id` - Delete inbound mapping (`user_id` in query/body).

### Inbound Context Strategy (`/api/inbound-context-strategy`)

- `POST /create` - Create strategy.
- `GET /list?user_id=...` - List strategies.
- `GET /details/:id?user_id=...` - Strategy details.
- `PATCH /update/:id` - Update strategy (`user_id` in body).
- `DELETE /delete/:id` - Delete strategy (`user_id` in query/body).

### Analytics (`/api/analytics`)

Authentication:
- Uses `user_id` query parameter
- Does not require `Authorization` header

Endpoints:
- `GET /dashboard?user_id=...` - Summary totals and period counts.
- `GET /calls/by-assistant?user_id=...` - Call metrics grouped by assistant.
- `GET /calls/by-phone-number?user_id=...` - Call metrics grouped by destination number.
- `GET /calls/by-time?user_id=...` - Time-series metrics (`granularity=day|week|month`).
- `GET /calls/by-service?user_id=...` - Call metrics grouped by service.

Supported query params:
- Common: `start_date`, `end_date`
- By phone number: `assistant_id`
- By time: `assistant_id`, `granularity`

Example:

```bash
curl -X GET "http://localhost:3000/api/analytics/dashboard?user_id=YOUR_USER_ID&start_date=2026-03-01T00:00:00Z&end_date=2026-03-28T23:59:59Z"
```

## ID Usage Notes

For several modules (assistant, sip, tool, inbound, strategy), APIs accept either:
- Local MongoDB `_id`
- External service IDs stored in local records

## Project Structure

```text
INTVyom_Backend/
├── README.md
├── package.json
├── Dockerfile
├── docker-compose.yml
├── deploy.sh
├── .env.example
└── src/
    ├── app.js
    ├── config/
    │   └── db.js
    └── modules/
        ├── analytics/
        │   ├── analytics.controller.js
        │   ├── analytics.routes.js
        │   └── analytics.service.js
        ├── auth/
        │   ├── auth.controller.js
        │   ├── auth.routes.js
        │   ├── auth.service.js
        │   └── user.model.js
        ├── assistant/
        │   ├── assistant.controller.js
        │   ├── assistant.model.js
        │   ├── assistant.routes.js
        │   └── assistant.service.js
        ├── call/
        │   ├── call.controller.js
        │   ├── call.routes.js
        │   └── call.service.js
        ├── inbound/
        │   ├── inbound.controller.js
        │   ├── inbound.model.js
        │   ├── inbound.routes.js
        │   └── inbound.service.js
        ├── inbound-context-strategy/
        │   ├── inbound-context-strategy.controller.js
        │   ├── inbound-context-strategy.model.js
        │   ├── inbound-context-strategy.routes.js
        │   └── inbound-context-strategy.service.js
        ├── integration/
        │   ├── integration.controller.js
        │   ├── integration.model.js
        │   ├── integration.routes.js
        │   └── integration.service.js
        ├── sip/
        │   ├── sip.controller.js
        │   ├── sip.model.js
        │   ├── sip.routes.js
        │   └── sip.service.js
        ├── tool/
        │   ├── tool.controller.js
        │   ├── tool.model.js
        │   ├── tool.routes.js
        │   └── tool.service.js
        ├── webcall/
        │   ├── webcall.controller.js
        │   ├── webcall.routes.js
        │   └── webcall.service.js
        └── passthrough_call/
            ├── passthrough.controller.js
            ├── passthrough.routes.js
            └── passthrough.sevice.js
```

## Scripts

- `npm start` - Start API server.
- `npm test` - Placeholder script (currently exits with error by design).
