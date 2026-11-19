# Progress — Exotel recording proxy endpoint

| Step | Status | Notes |
|---|---|---|
| Scope recorded + questions answered | done | `scope.md`; stream-only, binary response, mandatory credentials, no org settings. |
| Plan shown + approved | done | User replied "proceed". |
| Config + env docs | done | `src/core/config.js`, `.env.example`, `README.md`. |
| Exotel recording service | done | `src/services/exotel/exotelRecordingService.js`; allowlist, redirects, caps, sanitization. |
| Route + validation | done | `POST /api/call/recording` in `src/api/routes/call.routes.js`. |
| Tests | done | 13 new service tests + 4 new route tests; auth-path assertion added to `tests/api/app.test.js`. |
| Swagger + docs | done | New path with binary responses, ARCHITECTURE tree, CHANGELOG entry. |
| Verification | done | `node --test`: 212 pass / 0 fail. `node --check` on all changed JS. Swagger parses. |
| Independent review | done | Read-only review; 5 low findings, 3 fixed (base64 redaction, error-body cap, swagger MIME), 1 mitigated (short query values), 1 informational (`:443` normalization, no impact). |
| Report | done | `agent-tracking/reports/2026-11-19-feature-exotel-recording-proxy.html`. |
