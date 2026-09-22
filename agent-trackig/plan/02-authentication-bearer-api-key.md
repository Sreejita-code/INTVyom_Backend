# Plan 02 — Real authentication: bearer `api_key`, hard cutover

**Status:** ready to execute
**Depends on:** nothing technically; land Plan 01 first so its smaller diff is not tangled with this one
**Written:** 2026-09-22

> **Security notice — read before starting.**
> This repository currently has no authentication of any kind. Identity is whatever `user_id` the
> caller puts in the request body or query string, and one endpoint hands out the tenant's upstream
> LiveKit API key to anyone who knows a username. Until this plan ships, assume every tenant's SIP
> credentials and LiveKit key are readable by anyone who can reach the service. Treat the live
> deployment accordingly: restrict network access to it, and rotate the exposed keys after the fix
> is deployed, not before — rotating first would break the very clients you are about to migrate.

---

## 1. The gap

There is no auth middleware. `src/server.js:37-49` mounts twelve routers directly, and each route
reads `user_id` from `req.body` or `req.query` and passes it to `getUserWithKey`
(`src/auth/userAccess.js`), which only checks that such a user exists and has a key.

Two concrete exposures follow from that:

1. **`GET /api/auth/get_api?user_name=<name>` returns the tenant's upstream LiveKit API key and their
   `user_id`, with no credential at all** (`src/api/routes/auth.routes.js:26`,
   `src/auth/auth.service.js` `getApiKeyByUserName`). A username is not a secret. This is the root
   exposure: the key it hands out is the credential the proxy uses for every upstream call on that
   tenant's behalf.

2. **`GET /api/sip/list?user_id=<id>` returns `trunk_config` verbatim**
   (`src/sip/sip.service.js:54`), and `trunk_config` holds Twilio `address`, `numbers`, `username`
   and `password` (`src/core/db/schemas/sip.model.js:14`). `GET /api/sip/details/:id` does the same
   (`sip.service.js:74`). Upstream deliberately withholds this: "Trunk configuration details
   (`trunk_config`) are **not** included in the list response for security reasons"
   (`api/sip/list.md`). Upstream has no trunk-details endpoint at all (`api/sip/index.md`).

Beyond those two, every read and write endpoint in the service is cross-tenant: a guessed or leaked
`user_id` reads and modifies another tenant's assistants, trunks, tools, audio and analytics.

---

## 2. Decisions already taken

Settled with the user. Do not re-litigate.

- **Credential: the stored upstream `api_key`, sent as `Authorization: Bearer <api_key>`.** No new
  dependency, no token lifecycle, same scheme the upstream API uses. Accepted cost: the key does not
  expire and cannot be revoked per session; rotating a user's upstream key also rotates their proxy
  credential.
- **Hard cutover.** The middleware is required from the first deploy. No `REQUIRE_AUTH` flag, no
  grace period — a flag left unflipped leaves the hole open forever. Every client must send the
  header before this deploys.
- **`user_id` in the payload stops being identity.** It is ignored where present; identity comes from
  `req.user`.

---

## 3. Steps

Work one step at a time and keep `npm test` green throughout. Steps 1-2 add the mechanism, step 3 is
the wide mechanical change, steps 4-6 close the two exposures, steps 7-8 lock it down and document
it.

### Step 1 — `src/core/middleware/requireAuth.js` (new)

Follow the shape of the existing middleware in `src/core/middleware/` — small, one job, throws with
`error.status` and lets the central handler build the body.

```js
const User = require('../db/schemas/user.model');

// Identity is the upstream LiveKit key the user was issued at signup, sent the way the upstream
// API takes it. Anything else — a body field, a query param — is data, never identity.
const requireAuth = async (req, res, next) => {
  try {
    const header = req.get('authorization') || '';
    const [scheme, token] = header.split(' ');

    if (!token || scheme.toLowerCase() !== 'bearer') {
      const error = new Error('Authorization header with a Bearer API key is required');
      error.status = 401;
      throw error;
    }

    const user = await User.findOne({ api_key: token });
    if (!user) {
      const error = new Error('Invalid API key');
      error.status = 401;
      throw error;
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};
```

Notes for the implementer:

- Answer `401` for both "no header" and "unknown key". Do not distinguish them in the response body —
  the distinction only helps someone probing for valid keys.
- Never log the token, not even truncated, and never put it in an error message.
- Keep the comparison to the plain indexed lookup. Hashing the stored key is the right long-term
  move, but it belongs to the "separate proxy key" design the user did not choose here.

### Step 2 — `src/server.js`: mount it

Mount `requireAuth` on every `/api` router except the two that create or prove identity:

- `POST /api/auth/signup` — the user has no key yet.
- `POST /api/auth/login` — password is the credential here.

`GET /api/auth/get_api` is **not** exempt; see step 4.

Cleanest shape given the current wiring: mount `authRoutes` first, then
`app.use('/api', requireAuth)` before the remaining eleven `app.use('/api/...')` lines, and apply
`requireAuth` per route inside `auth.routes.js` where needed. Whatever shape you choose, prove it: a
test that hits one endpoint per router without a header and expects `401` (step 7).

### Step 3 — routes stop reading `user_id`

Twelve route files read `user_id` today. Counts from `grep -c user_id src/api/routes/*.js`:

| File | Occurrences |
|---|---|
| `assistant.routes.js` | 32 |
| `tool.routes.js` | 23 |
| `integration.routes.js` | 15 |
| `inbound-context-strategy.routes.js` | 15 |
| `inbound.routes.js` | 14 |
| `audio.routes.js` | 12 |
| `sip.routes.js` | 10 |
| `call.routes.js` | 6 |
| `passthrough.routes.js` | 5 |
| `webcall.routes.js` | 3 |
| `analytics.routes.js` | 2 |
| `auth.routes.js` | 2 (step 4 covers these) |

In each handler:

- Delete the `user_id` extraction and its `400 user_id is required` guard.
- Pass `req.user._id` where `user_id` was passed.
- Leave the other required-field guards alone.

Services keep their `userId` first parameter — do not change service signatures. `getUserWithKey`
stays as it is: the "has an API key" check it performs is still meaningful, and calling it with
`req.user._id` is a cheap second read rather than a bug. If you prefer to skip the re-read, pass
`req.user` through and have the services accept a user document; that is a larger refactor — only do
it if it stays mechanical, and never mix it into the same commit as the middleware.

Do this file by file, running `npm test` after each. Any test that constructs a request with
`user_id` in the body must gain the header instead.

### Step 4 — close the key-disclosure endpoint

`GET /api/auth/get_api?user_name=<name>` currently returns `user_id` and `api_key` uncredentialed.
It cannot be fixed by the bearer middleware — the whole point of the endpoint is that the caller does
not have the key yet.

Replace it with a credentialed lookup: `POST /api/auth/get_api` taking `user_name` and `password`,
verifying the password with `bcrypt.compare` exactly as `loginUser` does, and only then returning the
key. The simplest correct version reuses `authService.loginUser` and returns the key from the user it
resolves — at which point the endpoint is a near-duplicate of `POST /api/auth/login`, which already
returns `api_key` in its response body. Prefer deleting `get_api` outright and pointing clients at
`login`; keep it only if a client demonstrably calls it.

Either way: no endpoint may return an `api_key` without a password or an existing valid key.

### Step 5 — stop returning SIP credentials

`src/sip/sip.service.js`:

- `listSipTrunks` (line 54) — project `trunk_config` out of the query
  (`.select('-trunk_config')`) so the list matches upstream, which withholds it
  (`api/sip/list.md`).
- `getSipTrunkDetails` (line 74) — same. Upstream documents no trunk-details endpoint, so there is no
  contract requiring the config to come back. If a client genuinely needs to show which numbers a
  trunk carries, return only the non-secret keys (`address`, `numbers`) and never `username` /
  `password`.

Note it in the README as a deliberate response-shape change, since it is visible to existing clients.

### Step 6 — index the lookup

`src/core/db/schemas/user.model.js` — add `index: true` to `api_key`. Every authenticated request
performs this query; without an index it is a collection scan per request. Do not mark it `unique`:
`api_key` is nullable (issuance is deliberately non-fatal at signup,
`src/auth/auth.service.js` step 3), and a unique index over multiple `null`s needs a partial filter.
If you want uniqueness, use
`{ unique: true, partialFilterExpression: { api_key: { $type: 'string' } } }` and verify it against
the existing collection before shipping.

A user row whose `api_key` is `null` must never authenticate. The lookup is by token value, so this
holds automatically — but assert it in a test (`Authorization: Bearer null`, and an empty token).

### Step 7 — tests

`tests/api/app.test.js`:

- one request per mounted router with no `Authorization` header expects `401`;
- the same request with a valid key expects the handler to run;
- `Bearer <unknown>` expects `401`;
- a user row with `api_key: null` cannot authenticate by any token spelling.

Then fix the per-module tests that pass `user_id` in the payload: they must set the header and stop
relying on the body field. Where a test asserted `400 user_id is required`, that assertion is now
wrong — the contract changed; update it and say so in the comment.

Add one cross-tenant test, because it is the whole point of the change: user A's key must not be able
to read or modify user B's assistant, and the attempt must not answer `200`.

### Step 8 — documentation, in the same change

`swagger.yaml`:

- add a `bearerAuth` security scheme under `components.securitySchemes`
  (`type: http`, `scheme: bearer`);
- add a top-level `security: [{ bearerAuth: [] }]`, and override it with `security: []` on
  `/api/auth/signup` and `/api/auth/login`;
- remove every `user_id` request-body property and query parameter from the paths;
- add `401` responses;
- update the SIP list/details response schemas to show `trunk_config` is not returned;
- update or remove the `get_api` path per the decision in step 4.

`README.md`:

- a short "Authentication" section: obtain the key from signup or login, send it as
  `Authorization: Bearer <api_key>`, `401` otherwise;
- state plainly that this is a **breaking change** for every existing client, with the date it
  shipped;
- note that the SIP list and details responses no longer carry `trunk_config`.

`AGENTS.md` — add one line to the layering conventions: identity comes from `req.user`, set by
`requireAuth`; routes never read identity from the payload. This is a convention change, so it
belongs there.

---

## 4. Verification

```bash
npm test
node --check <each changed file>
node -e "const y=require('yamljs');y.load('swagger.yaml')"
```

Manual smoke test against a running instance, with a real key in an environment variable so it never
lands in shell history or in anything you paste back:

```bash
export LK_KEY=...   # never echo this
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/api/assistant/list            # expect 401
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $LK_KEY" \
  localhost:3000/api/assistant/list                                                    # expect 200
curl -s -H "Authorization: Bearer $LK_KEY" localhost:3000/api/sip/list | grep -c password  # expect 0
```

Acceptance criteria:

- [ ] Every `/api` route except `POST /api/auth/signup` and `POST /api/auth/login` answers `401`
      without a valid bearer key.
- [ ] No endpoint returns an `api_key` without a password or an existing valid key.
- [ ] `GET /api/sip/list` and `GET /api/sip/details/:id` contain no `trunk_config`, no `username`,
      no `password`.
- [ ] User A's key cannot read or modify user B's records.
- [ ] `user_id` no longer appears as a request field in `swagger.yaml`.
- [ ] `npm test` green, including the new 401 and cross-tenant cases.
- [ ] No API key value appears in any log line.

---

## 5. Effect on existing users

**This breaks every existing client the moment it deploys.** That was the chosen trade — a grace flag
leaves the exposure open indefinitely — but the rollout has to be ordered:

1. Tell every client integrator the header is coming, and give them the date.
2. Ship the client change: read `api_key` from signup/login, send
   `Authorization: Bearer <api_key>`, stop sending `user_id`.
3. Deploy this change.
4. Rotate the LiveKit keys that were exposed by the old `get_api` endpoint, and the Twilio trunk
   credentials that were readable through `GET /api/sip/list`. Rotate **after** the cutover: doing it
   first breaks clients that are still on the old path.

Data migration: none. No schema field changes meaning; the `api_key` index is additive. Users whose
`api_key` is `null` (upstream issuance failed at signup) cannot authenticate at all — they could not
use the service anyway, since `getUserWithKey` already refused them, but now they fail at the door
with `401` instead of `400`. Worth one line in the README so support knows what that looks like.

---

## 6. Deliberately NOT doing

- **No JWT, no refresh tokens, no session store.** Rejected in favour of the stored key.
- **No separate proxy-scoped key.** It is the better design — the upstream key would never leave the
  server — but it needs an issuance endpoint, a rotation endpoint, hashed storage and a migration for
  existing users. Revisit if key rotation becomes a requirement.
- **No roles, no super-admin.** Upstream documents an `/admin/*` surface with `403` semantics
  (`api/admin/index.md`); this proxy implements none of it and this plan does not add it.
- **No rate limiting, no audit log** of authentication failures. Worth a follow-up ticket.
- **No change to how upstream calls are authenticated.** `callExternal` keeps sending the user's key
  as it does today.
- Everything listed in Plan 01 section 6 remains out of scope here too.
