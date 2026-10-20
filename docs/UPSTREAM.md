# How the backend uses the upstream LiveKit API

The "core" is the LiveKit Agents REST API. This backend never talks to LiveKit directly from a
route: every call goes through one function, and every resource the user owns exists twice, once
upstream (the real thing) and once in MongoDB (a mirror that adds ownership and lookups).
The upstream contract itself is documented by the `api-livekit-docs` MCP server; read it there
before changing any call.

## One client: `callExternal`

`src/services/livekit/livekitService.js` is the only file that imports `axios`. Domains call
`callExternal(apiKey, { path, method, data, params, headers, fallback, ... })`.

- Base URL is `EXTERNAL_API_BASE` (`src/core/config.js`), shared by every module.
- `apiKey` becomes `Authorization: Bearer <apiKey>`. It is applied last, so a caller-supplied header
  cannot replace it. `null` means an unauthenticated call (key issuance only).
- Success returns `response.data` unchanged.
- An upstream error response becomes `new Error(upstreamMessage || fallback)` with `err.status`
  set to the upstream status, so a 400/404/422 reaches the client instead of becoming a 500.
  `attachPayload: true` also carries the upstream body on `err.payload` (analytics uses it).
- A request that never reached upstream has no status (the central handler answers 500) unless
  `networkStatus` is passed.
- Upstream response bodies carry API keys: never log them.

## Whose key

```text
signup ─> POST /auth/create-key (no key) ─> upstream issues api_key ─> stored on the user row
every later request: Authorization: Bearer <api_key>
    requireAuth looks the user up by that key ─> req.user
    service calls getUserWithKey(req.user._id) ─> callExternal(user.api_key, ...)
```

The same key authenticates the client to this backend and this backend to upstream, so upstream
enforces tenancy too. Signup is deliberately non-fatal when issuance fails: the user is saved
with `api_key = null` and cannot authenticate until that is repaired.

## Local mirror rules

- **Upstream first, local second.** Create, update and delete call upstream, and only a
  successful answer touches MongoDB (for example `deleteAssistant` deletes upstream, then removes
  the local row and reports `local_data_removed`). A failed upstream call leaves local state as it was.
- **Dual ids.** Most path ids (sip, inbound, strategy, assistant details and update) accept the local
  `_id` or the external id; `findByLocalOrExternalId` (`src/core/db/functions/`) resolves either,
  scoped to the user. Assistant delete and the tool endpoints take the external id only. When no
  local row exists, some domains pass the id through and let upstream answer 404.
- **Mirror only what upstream would not give back.** The inbound context strategy keeps just id,
  name and type locally, because upstream merges headers and masks secrets and a local copy would
  go stale.
- **Provider keys come from the Integration store.** TTS and STT keys in a payload are overwritten;
  only `assistant_llm_config.api_key` is a per-assistant override (see ASSISTANT-RULES). Keys are
  stored once through `POST /api/integration/store` and written into each assistant config at
  create/update time (`assistant.builder.js`). `src/integration/providers.js` maps provider to the integration row.
- **Key rotation re-sync.** Storing a new provider key starts a `resyncjobs` job that PATCHes every
  affected assistant upstream with the new key (`assistant.resync.js`, concurrency
  `RESYNC_CONCURRENCY`). Assistants carrying their own `api_key` are skipped.

## Upstream endpoints the backend calls

| Group | Upstream paths |
|---|---|
| Auth | `/auth/create-key` |
| Assistant | `/assistant/create`, `/assistant/list`, `/assistant/details/{id}`, `/assistant/update/{id}`, `/assistant/delete/{id}`, `/assistant/call-logs/{id}` |
| SIP | `/sip/create-outbound-trunk`, `/sip/deactivate/{id}` |
| Calls | `/call/outbound`, `/call/outbound_passthrough`, `/call/records`, `/call/queue/{id}`, `/web_call/get_token`, `/meeting_call/join` |
| Tools | `/tool/create`, `/tool/list`, `/tool/details/{id}`, `/tool/update/{id}`, `/tool/delete/{id}`, `/tool/{action}/{assistantId}` (attach/detach) |
| Inbound | `/inbound/assign`, `/inbound/list`, `/inbound/update/{id}`, `/inbound/detach/{id}`, `/inbound/delete/{id}` |
| Context strategy | `/inbound_context_strategy/create`, `list`, `details/{id}`, `update/{id}`, `delete/{id}` |
| Audio | `/audio/upload`, `/audio/list`, `/audio/{id}` |
| Analytics | `/analytics/...` (forwarded) |

Mirroring upstream validation locally (model allowlists, TTS/STT pairing) is deliberate: a bad
value fails here with a readable `400` and `suggestions`. When upstream adds or retires a model,
the allowlists in `assistant.rules.js` and `tts-rules.js` change in the same release. Details:
[ASSISTANT-RULES](ASSISTANT-RULES.md).

## Known trap

The shared HTTPS agent is created with `rejectUnauthorized: false`, so the upstream certificate
is not verified even though every call carries a user's API key, so a network attacker between
the two could read keys. Fixing it means turning verification on, which requires the upstream host
to present a certificate chain Node trusts (or a configured CA).
