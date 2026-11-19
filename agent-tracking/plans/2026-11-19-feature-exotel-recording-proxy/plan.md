# Plan — Exotel recording proxy endpoint

Approved in conversation on 2026-11-19 ("proceed").

## Gap

- `src/api/routes/call.routes.js` has only `/outbound` and `/queue/:queue_id`; no recording endpoint.
- No Exotel client exists; `src/services/` contains only `livekit/`.
- `src/core/config.js`, `.env.example`, `.env` have no Exotel variables.
- No Supabase/object storage in this repo; the user chose stream-only, so none is needed.

## Steps

1. `src/core/config.js` — add `exotelApiKey` / `exotelApiToken` from trimmed env values. Only this file reads `process.env`.
2. `.env.example`, `README.md` — document both variables with placeholders; no real secrets.
3. `src/services/exotel/exotelRecordingService.js` (new) — download half only:
   - HTTPS allowlist: `recordings.exotel.com` or `recordings.<region>.exotel.com`, port 443, no userinfo or IP literals.
   - Basic auth from Settings, `redirect: 'manual'`, max 3 hops with re-validation of each `Location`, 30s `AbortSignal.timeout`, `cache: 'no-store'`.
   - 100 MB cap, buffered into a Buffer so failures can still return a clean JSON error.
   - Upstream errors: parse `x-amz-error-code`, XML `Code`/`Message`, JSON `Code`/`message`; sanitize credentials, full URL and every query value from the message; throw with `status = 502`.
4. `src/api/routes/call.routes.js` — `POST /recording`: zod-validated body, delegate to service, audio headers, `res.send(audio)`; 400 on invalid input, statuses flow to the central error handler.
5. Tests under `tests/services/exotel/` and `tests/api/call/` using `node --test` + supertest, stubbing `fetch`.
6. `swagger.yaml` — document the endpoint, binary `200`, `400`/`401`/`502` errors.
7. `docs/ARCHITECTURE.md` structure tree + `docs/CHANGELOG.md` one-line entry.
8. Verification: `npm test`, `node --check` on changed JS, YAML parse of `swagger.yaml`.

## Deliberately not doing

Supabase, `org_settings`, retention/metadata tables, GridFS, Exotel webhook, call-id lookup, LiveKit proxy changes, git commits.

## Assumptions

- Host pattern and 100 MB cap are defaults, easy to change.
- Credentials are mandatory per the user's choice even though the sample curl is unauthenticated.
- Buffered binary response rather than chunked piping, so errors stay clean.
