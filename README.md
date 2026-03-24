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
- Provider keys (for services like Sarvam/Cartesia/ElevenLabs) are stored through integration APIs, not read from process env.

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

### SIP (`/api/sip`)

- `POST /create-outbound-trunk` - Create SIP trunk.
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

- `POST /get-token` - Generate web call token.

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
        └── webcall/
            ├── webcall.controller.js
            ├── webcall.routes.js
            └── webcall.service.js
```

## Scripts

- `npm start` - Start API server.
- `npm test` - Placeholder script (currently exits with error by design).
