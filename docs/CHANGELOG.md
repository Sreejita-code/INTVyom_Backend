# Changelog

Newest first. **BREAKING** marks a change that can break an existing client. Entries before
2026-10-20 were seeded from commit subjects and the README's own breaking-change notes; `git log`
has the detail. Add a line here with every contract change.

## 2026-10-20 — Duplex mode, model refresh, docs split

- **BREAKING** `assistant_mode` accepts `duplex` (OpenAI GPT-Live `gpt-live-1`, reasoning handed to
  `assistant_llm_config.backend_model`). Assistant rules synced with upstream 1.6.0: new model
  lists and TTS rules.
- **BREAKING** Retired model ids `gpt-5.1` and `gpt-5.4-nano` (also as duplex `backend_model`) map to
  `gpt-6-sol` / `gpt-6-luna`; `scripts/migrate-retired-models.js` moves stored assistants.
- Docs: README is now a run guide; developer docs live in `docs/`; the `/mcp` server gained
  `list_dev_docs`, `get_dev_doc` and `get_changelog`.

## 2026-09-23 — Secrets no longer returned

- **BREAKING** SIP trunk responses return an allow-list of non-secret `trunk_config` keys
  (`address`, `numbers`, `exotel_number`, `sip_host`, `sip_port`, `sip_domain`); credentials are never returned.
- **BREAKING** Integration responses no longer include the plaintext provider `api_key`.
- Renamed Vyom to VoiceKit in docs and project names.

## 2026-09-22 — Bearer auth on every route

- **BREAKING** Every endpoint except `POST /api/auth/signup` and `POST /api/auth/login` requires
  `Authorization: Bearer <api_key>`. A `user_id` in a body or query string is ignored. A user whose
  `api_key` is `null` gets `401` instead of `400`.
- **BREAKING** `GET /api/auth/get_api` removed: it returned the tenant's upstream key to anyone who knew a username. Use `POST /api/auth/login`.
- **BREAKING** `user_name` is unique (run `scripts/audit-duplicate-usernames.js` before deploy).
- Docs-only API MCP at `/mcp`. Gemini realtime added. Model lists refreshed.

## 2026-09-18 — Google Meet

- `POST /api/meeting-call/...` Google Meet join integration.

## 2026-08-13 — Validation and wizard

- Assistant create/update validate model families, voices, tiers and speech ids against upstream.
  Starter templates and a guided wizard added. Sarvam language codes are BCP-47 Indic (`hi-IN`).

## 2026-08-08 — Upstream contract alignment

- **BREAKING** Conformed to the upstream contract; STT providers added; billable minutes computed in parallel.

## 2026-08-06 — Inbound and context strategy

- **BREAKING** Inbound and inbound-context-strategy endpoints conform to the upstream contract.

## 2026-08-01 — Cascade mode

- **BREAKING** `cascade` runtime mode (separate STT, LLM, TTS); the `assistant_llm_mode` alias is retired.

## 2026-07-30 — Assistant contract

- **BREAKING** Assistant endpoints conform to the LiveKit Agents contract; naming unified (for example TTS `model`/`config` became `tts_model`/`tts_config`).
