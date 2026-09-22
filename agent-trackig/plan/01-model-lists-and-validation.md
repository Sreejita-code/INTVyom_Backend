# Plan 01 — Refresh model allowlists, validation and docs

**Status:** ready to execute
**Depends on:** nothing
**Blocks:** nothing (Plan 02 is independent, but land this one first — it is smaller and keeps the suite green)
**Written:** 2026-09-22

Read `CLAUDE.md` and `AGENTS.md` before starting. Every upstream fact in this plan was read from the
`api-livekit-docs` MCP server on 2026-09-22; the citation is given on each step. If you change
anything not listed here, re-read the doc page first — do not extend a list from memory.

---

## 1. The gap

This proxy mirrors the upstream allowlists so that a bad model fails locally with a readable `400`
instead of reaching upstream as a `422`. The mirrors have drifted. Four lists are wrong in both
directions: they reject values upstream accepts, and accept values upstream rejects with `422`.

| List | Local (`src/assistant/assistant.rules.js`) | Upstream |
|---|---|---|
| `GEMINI_LIVE_MODELS` (line 29) | `gemini-2.5-flash-native-audio-preview-12-2025`, `gemini-live-2.5-flash-native-audio`, `gemini-3.1-flash-live-preview` | `gemini-3.8-live` (default), `gemini-3.8-live-extended-thinking`, `gemini-3.1-flash-live-preview`, `gemini-2.5-flash-native-audio-preview-12-2025`. `gemini-live-2.5-flash-native-audio` is the Vertex-only id and is a `422` |
| `STT_MODELS_BY_PROVIDER.sarvam` | `saaras:v3`, `saaras:v2.5`, `saarika:v2.5` | `saaras:v3`, `saaras:v4`. The `saaras:v2.5` / `saarika:v2.5` pair was sunset by Sarvam and is a `422` |
| `STT_MODELS_BY_PROVIDER.deepgram` | `nova-3`, `nova-2`, `flux-general-en`, `flux-general-multi` | `nova-3`, `nova-3-general`, `nova-3-multilingual`, `flux-general-en`, `flux-general-multi`. Deepgram stopped publishing a price for `nova-2`, so upstream rejects it |
| `ELEVENLABS_TTS_MODELS` | `eleven_v3`, `eleven_multilingual_v2`, `eleven_turbo_v2_5`, `eleven_flash_v2_5` | the same four plus `eleven_v3_conversational` |

Sources: `reference/models.md` (sections "Realtime LLM", "STT", "TTS"), `reference/compatibility.md`
section "Model IDs", `api/assistant/create.md` (Realtime and Cascade tabs).

The worst single consequence: `gemini-3.8-live` is the upstream **default** Gemini Live model and
this proxy answers `400` for it, while `gemini-live-2.5-flash-native-audio` — which upstream refuses
outright — passes local validation and fails upstream.

Two further defects in the same area:

1. **Sarvam TTS language list is the STT list.** `src/assistant/assistant.validation.js:29`
   validates `assistant_tts_config.target_language_code` against the 24-code Sarvam **STT** roster.
   Bulbul speaks 11: `bn-IN`, `en-IN`, `gu-IN`, `hi-IN`, `kn-IN`, `ml-IN`, `mr-IN`, `od-IN`,
   `pa-IN`, `ta-IN`, `te-IN` (`reference/models.md`, "Sarvam `target_language_code` defaults to
   `en-IN`, and accepts 11 codes only"; `api/assistant/create.md`, Sarvam TTS tab). A code such as
   `as-IN` is accepted locally and substituted with `en-IN` upstream, so the assistant speaks a
   language nobody chose.

2. **`assistant_end_call_webhook` is unreachable.** Upstream accepts it on create and update —
   `{ "timeout_seconds": 1–120, "attempts": 1–5 }`, each falling back to a server default when
   omitted or `null` (`api/assistant/create.md` Common Fields table; `api/assistant/update.md`
   Common Fields table). It is absent from `ASSISTANT_FIELDS`, so `pickAssistantFields` drops it
   silently and no client can tune webhook delivery through this proxy.

Documentation states retired models as current: `swagger.yaml:80-83` and the `swagger.yaml:3365-3374`
model description still list `gpt-5.1-chat-latest`, `gpt-5.2-chat-latest`, `gpt-5.3-chat-latest`,
`chat-latest` and `gpt-oss-120b`. Those were retired by OpenAI on 2026-06-19 or were never served by
`api.openai.com`; the code already rejects all five (`OPENAI_CASCADE_MODELS`, and the comment above
it). Anyone copying from the docs gets a `400`.

**Checked and found correct — do not touch:** `OPENAI_REALTIME_MODELS`, `OPENAI_CASCADE_MODELS`,
`GEMINI_VOICES` (30 names), `SARVAM_SPEAKERS` (30 v3 names), `SERVICE_TIERS`, `TOOL_CHOICES`,
`CASCADE_STT_MODELS`, `PIPELINE_STT_MODELS`, the reasoning/chat family split in
`assistant.validation.js`, and `src/integration/providers.js`.

---

## 2. Decisions already taken

These were settled with the user. Do not re-litigate them.

- **Keep the mirror.** Lists stay local so errors are readable. Accept that they need refreshing
  whenever upstream ships a model.
- **Reject dead values, and ship an audit script.** A stored value that upstream now rejects is
  rejected here too. A read-only script lists the affected rows so they can be repaired by hand.
  No auto-repair, no `--apply`.
- **Scope is models, validation and docs only.** No new endpoints, no error-status refactor, no
  swagger response-shape fixes. The findings left out are listed in section 6.

---

## 3. Steps

Work one step at a time. After each step run the verification commands in section 4. Do not batch
steps: step 5 depends on steps 1–4 being visible to the test file.

### Step 1 — `src/assistant/assistant.rules.js`: refresh the four lists

1. Replace `GEMINI_LIVE_MODELS` (line 29) with:

   ```js
   const GEMINI_LIVE_MODELS = [
     'gemini-3.8-live',
     'gemini-3.8-live-extended-thinking',
     'gemini-3.1-flash-live-preview',
     'gemini-2.5-flash-native-audio-preview-12-2025',
   ];
   ```

   Update the comment above it: the default is `gemini-3.8-live`;
   `gemini-live-2.5-flash-native-audio` is the Vertex AI id and upstream answers `422`
   (`ValueError: … is a VertexAI model, but vertexai=False`), so it is deliberately absent.

2. In `STT_MODELS_BY_PROVIDER`, set:

   ```js
   sarvam: ['saaras:v3', 'saaras:v4'],
   deepgram: ['nova-3', 'nova-3-general', 'nova-3-multilingual', 'flux-general-en', 'flux-general-multi'],
   ```

   Leave `cartesia`, `elevenlabs` and `openai` unchanged. Extend the comment: `saaras:v2.5` and
   `saarika:v2.5` were sunset by Sarvam; `nova-2` lost its published price and upstream prices every
   call it accepts, so both are a `422` upstream.

3. Add `'eleven_v3_conversational'` to `ELEVENLABS_TTS_MODELS`, second in the list (it is the
   sibling of the default). Note in the comment that neither v3 model reads
   `voice_settings.speed`.

4. Add the Sarvam TTS language roster next to `SARVAM_SPEAKERS`:

   ```js
   // Bulbul v3 speaks 11 languages — a much shorter list than the 24 Sarvam STT codes, and the
   // two are easy to confuse because both are BCP-47 Indic. An unlisted code is replaced with
   // `en-IN` upstream, so the assistant would speak a language nobody chose.
   const SARVAM_TTS_LANGUAGES = [
     'bn-IN', 'en-IN', 'gu-IN', 'hi-IN', 'kn-IN', 'ml-IN', 'mr-IN', 'od-IN', 'pa-IN', 'ta-IN', 'te-IN',
   ];

   const assertSarvamTargetLanguageAllowed = (ttsModel, code) => {
     if (code === undefined || code === null || code === '') return;
     if (String(ttsModel || '').toLowerCase() !== 'sarvam') return;
     if (SARVAM_TTS_LANGUAGES.includes(String(code))) return;
     throw badRequest(
       `Sarvam target_language_code '${code}' is not spoken by bulbul:v3 — choose one of: ` +
       `${quotedList(SARVAM_TTS_LANGUAGES)}. Note 'en-IN', not 'en-US'.`
     );
   };
   ```

5. Add `'assistant_end_call_webhook'` to `ASSISTANT_FIELDS`, directly after
   `'assistant_end_call_url'` (upstream documents them together).

6. Export `SARVAM_TTS_LANGUAGES` and `assertSarvamTargetLanguageAllowed`.

### Step 2 — `src/assistant/assistant.validation.js`: stop restating the lists, split the language sets

1. `COMPATIBILITY_MATRIX` restates model sublists that now contradict `assistant.rules.js`:
   `pipeline.stt.restrictions.sarvam.models`, `cascade.stt.restrictions.*.models`,
   `pipeline.tts.restrictions.*.models` and `cascade.tts.restrictions.*.models`. Import
   `STT_MODELS_BY_PROVIDER` and `ELEVENLABS_TTS_MODELS` from `./assistant.rules` and reference them,
   or delete the `models` keys where the surrounding `notes` already carry the information. Prefer
   deleting: a restated copy is what drifted. Keep every `notes` string — the wizard reads them
   (`src/assistant/wizard.service.js:206`).

2. Fix the two stale notes: `realtime.llm.restrictions.gemini.notes` names
   `gemini-2.5-flash-native-audio-preview-12-2025` as the default; it is `gemini-3.8-live`.

3. Split the Sarvam language sets. Keep `VALID_LANGUAGE_CODES.sarvam` as the 24-code STT roster, and
   have the **TTS** branch of `validateAssistantConfiguration` (the
   `assistant_tts_config.target_language_code` call, around line 560) validate against
   `SARVAM_TTS_LANGUAGES` instead. Simplest shape: call
   `assertSarvamTargetLanguageAllowed(ttsProvider, assistant_tts_config.target_language_code)` from
   `assistant.service.js` / `assistant.update.js` next to `assertSarvamSpeakerAllowed`, and drop the
   `sarvam` case from the TTS language branch here. Pick one path — do not validate in both places
   with two different messages.

### Step 3 — carry `assistant_end_call_webhook` end to end

1. `src/assistant/assistant.service.js` — add `assistant_end_call_webhook` to the `createAssistant`
   destructure and forward it onto `externalPayload` with the same
   `if (x !== undefined)` guard the sibling end-call fields use.
2. `src/assistant/assistant.update.js` — add `assistant_end_call_webhook: 'end_call_webhook'` to
   `LOCAL_FIELD_BY_PAYLOAD_KEY`.
3. `src/core/db/schemas/assistant.model.js` — add next to `end_call_url`:

   ```js
   // Upstream merges this object key by key, like interaction_config. `null` on a key means
   // "fall back to the server default" (END_CALL_WEBHOOK_TIMEOUT 30s, END_CALL_WEBHOOK_ATTEMPTS 3).
   end_call_webhook: {
     timeout_seconds: { type: Number, default: null },
     attempts: { type: Number, default: null }
   }
   ```

   Every upstream key must be declared — mongoose silently drops an undeclared path, which would make
   `local_data` disagree with upstream.

   **No migration is needed:** the field is additive and absent rows read as `null`, which is exactly
   "use the server default".

### Step 4 — `src/assistant/templates/realtime-gemini.js`

Change `model: "gemini-3.1-flash-live-preview"` to `model: "gemini-3.8-live"` and update the header
comment. `gemini-3.8-live` is the stable low-latency line upstream names for voice agents and the one
every platform feature works on. The other three templates were checked and hold valid values.

### Step 5 — tests

`tests/assistant/rules.test.js:140` currently asserts `saaras:v4` is **rejected**. The contract
genuinely changed — upstream now serves `saaras:v4` and rejects `saaras:v2.5`. Invert the assertion
and say so in the comment on the line, so the next reader knows it was deliberate. Never weaken a
test to make a change pass.

Add cases to `tests/assistant/rules.test.js`:

- `assertLlmModelAllowedInMode('realtime', 'gemini', 'gemini-3.8-live')` does not throw.
- `assertLlmModelAllowedInMode('realtime', 'gemini', 'gemini-live-2.5-flash-native-audio')` throws
  `/is not a Gemini Live model/`.
- `assertSttModelIdAllowed('sarvam', 'saaras:v2.5')` throws; `'saaras:v4'` does not.
- `assertSttModelIdAllowed('deepgram', 'nova-2')` throws; `'nova-3-multilingual'` does not.
- `assertTtsModelIdAllowed('elevenlabs', 'eleven_v3_conversational')` does not throw.
- `assertSarvamTargetLanguageAllowed('sarvam', 'as-IN')` throws; `'hi-IN'` does not;
  `assertSarvamTargetLanguageAllowed('cartesia', 'as-IN')` does not throw (wrong provider, not our
  rule).
- `pickAssistantFields({ assistant_end_call_webhook: { timeout_seconds: 60 } })` keeps the key.

Mirror the last assertion into `scripts/check-assistant-payload.js` next to the existing whitelist
block, since that script is the no-DB self-check for exactly these rules.

Extend `tests/assistant/validation.test.js` with one case proving the Sarvam TTS split: a config with
`assistant_tts_model: 'sarvam'` and `target_language_code: 'as-IN'` is invalid, while the same code
on `assistant_stt_config.language` with `assistant_stt_model: 'sarvam'` is valid.

### Step 6 — `scripts/audit-assistant-models.js` (new, read-only)

Follow the conventions of the existing scripts in `scripts/`. Connect with the project's own
`src/core/db/dbConnect.js`, scan the `Assistant` collection, and print one line per offending row:
`<external_assistant_id> <field> <value> <why>`. Detect:

- `llm_config.model` in `['gemini-live-2.5-flash-native-audio', 'gpt-5.1-chat-latest', 'gpt-5.2-chat-latest', 'gpt-5.3-chat-latest', 'chat-latest', 'gpt-oss-120b']`
- `stt_config.model` in `['saaras:v2.5', 'saarika:v2.5', 'nova-2']`
- `tts_config.speaker` outside `SARVAM_SPEAKERS` when `tts_model === 'sarvam'`
- `tts_config.target_language_code` outside `SARVAM_TTS_LANGUAGES` when `tts_model === 'sarvam'`
- `tts_config.model` outside `ELEVENLABS_TTS_MODELS` when `tts_model === 'elevenlabs'`

Import every list from `src/assistant/assistant.rules.js` — do not restate them, that is the bug this
plan exists to fix. Exit `1` when any row matched, `0` otherwise, so it can gate a deploy. Read-only:
no writes, no `--apply` flag.

Print a closing line naming the repair path: send the corrected field on
`PATCH /assistant/update/{id}`; a rename-only PATCH still works because `resolvePairForUpdate`
carries the stored config through untouched, so an operator is never locked out of the record they
need to fix.

### Step 7 — documentation, in the same change

`swagger.yaml`:

- lines 56-68 (the Realtime LLM prose block) — Gemini Live list and default.
- lines 80-83 — delete `gpt-5.1-chat-latest`, `gpt-5.2-chat-latest`, `gpt-5.3-chat-latest`,
  `chat-latest`, `gpt-oss-120b`; add one sentence saying they were retired on 2026-06-19 or are not
  served by `api.openai.com`, and that an assistant still holding one answers calls with silence.
- lines 94-98 (STT provider table) — `saaras:v3` / `saaras:v4`; deepgram list without `nova-2`.
- line 3367-3369 (`model` description) — same Gemini list, default `gemini-3.8-live`.
- line 3514 (`enum:` for the ElevenLabs TTS model) — add `eleven_v3_conversational`.
- lines 3573-3579 (`assistant_stt_config.model` description) — same STT lists.
- the Sarvam TTS `target_language_code` property — state the 11 codes and that it is `en-IN`, not
  `en-US`.
- add an `assistant_end_call_webhook` object schema (`timeout_seconds` 1-120, `attempts` 1-5,
  both nullable) and reference it from the create and update request bodies.

`README.md`:

- line 31 and the surrounding Gemini default sentence.
- the STT table at lines 296-302 and the TTS paragraph at 315-320.
- the end-call webhook section — document `assistant_end_call_webhook` and what each field falls
  back to.

Document the traps, not just the fields. The three worth a sentence each: `en-IN` is not `en-US`;
`saaras:v4` and `nova-3-multilingual` are new while `saaras:v2.5`, `saarika:v2.5` and `nova-2` are
gone; `gemini-3.8-live` is now the default and `gemini-live-2.5-flash-native-audio` is Vertex-only.

`AGENTS.md` needs no change — no convention changed.

---

## 4. Verification

Run after **every** step, not only at the end:

```bash
npm test
node --check <each changed file>
node scripts/check-assistant-payload.js
node -e "const y=require('yamljs');y.load('swagger.yaml')"
```

`node src/integration/providers.js` is not needed — the provider/key map is untouched.

Acceptance criteria for the whole plan:

- [ ] `npm test` green, with the new cases from step 5 present and passing.
- [ ] Creating an assistant with `assistant_mode: "realtime"`, `provider: "gemini"`,
      `model: "gemini-3.8-live"` passes local validation.
- [ ] The same request with `gemini-live-2.5-flash-native-audio` is refused with a local `400` naming
      the four valid ids.
- [ ] `saaras:v4` and `nova-3-multilingual` accepted; `saaras:v2.5`, `saarika:v2.5`, `nova-2`
      refused.
- [ ] `eleven_v3_conversational` accepted as an ElevenLabs TTS model.
- [ ] Sarvam `target_language_code: "as-IN"` refused, `"hi-IN"` accepted.
- [ ] `assistant_end_call_webhook` reaches the upstream payload and the local mirror.
- [ ] `node scripts/audit-assistant-models.js` runs against a real database and exits non-zero only
      when a dead value is stored.
- [ ] No occurrence of `chat-latest` or `gpt-oss-120b` survives in `swagger.yaml` or `README.md`
      except as an explicitly-retired note.

---

## 5. Effect on existing users

This is the part to think about before writing code, per `CLAUDE.md` section 6.

- **A stored dead value now fails on the requests that send it.** Rows holding
  `gemini-live-2.5-flash-native-audio`, `saaras:v2.5`, `saarika:v2.5` or `nova-2` already fail
  upstream with a `422`; this change moves that failure earlier and makes the message readable. It
  does not make them worse.
- **The repair path stays open.** A PATCH that does not resend the offending field is unaffected:
  `resolvePairForUpdate` carries the stored config through, and the new asserts only fire on a value
  present in the request. Verify this explicitly with a test — a rename-only PATCH on a row holding
  `saaras:v2.5` must still succeed. If it does not, the assert is firing in the wrong place; move it.
- **Nothing is auto-rewritten.** The audit script reports; a human decides.
- **No default changes**, so no existing assistant's behavior shifts.

---

## 6. Deliberately NOT doing

Found and verified during the investigation, deliberately left for another change. Do not pick these
up while executing this plan; scaling the work is the user's call.

- New endpoints upstream documents and this proxy does not expose: `POST /meeting_call/join`,
  `GET /call/records/{room_name}/usage`, `GET /analytics/tokens/summary`,
  `GET /analytics/tokens/by-model`, `GET /logs`, `GET /auth/check-key`, the whole `/admin/*` surface.
- `preserveStatus(500)` on all five tool routes (`src/api/routes/tool.routes.js:33,42,51,62,73`) and
  `preserveStatus(400)` on audio details/delete (`src/api/routes/audio.routes.js:38,48`):
  `common.js:8` **forces** a status rather than preserving it, so every upstream 404/400/422 reaches
  the client as 500/400. `keepStatus` already exists for this.
- Swagger response shapes: web-call (`swagger.yaml:2030`) and passthrough (`:2092`) are documented
  flat, upstream nests under `data` and names the token field `token`; audio list (`:3111`) and call
  records (`:2199`) omit the `data.records` + `data.pagination` envelope.
- `swagger.yaml:1723` documents a `tool_execution_config.method` enum upstream has no notion of, and
  omits `timeout` and `value`. `swagger.yaml:1697` uses a `tool_name` example the upstream regex
  `^[a-z][a-z0-9_]*$` rejects.
- `src/api/routes/call.routes.js:19` answers 200 where upstream documents 202 (queued).
- `src/tool/tool.service.js:56,70` filters the local mirror by `external_tool_id` with no `user_id`,
  and aborts the local delete when upstream answers 404 — `sip.service.js:106` handles the same case.
- `src/inbound/inbound.service.js:209` hard-deletes a row upstream only soft-deletes.
- Context-strategy `timeout_seconds` documented locally as default `2.0`
  (`README.md:444`, `swagger.yaml:2548`); upstream default is `10.0`.
- `org_name` required locally (`user.model.js:5`), optional upstream.
- `passthrough_mode` truthy coercion in `src/sip/sip.service.js:20,39` — the string `"false"` is
  stored as `true`.
- README's end-call webhook section understates `call_end_reason` values and omits the meeting-call
  fields.
- Authentication and the credential exposure: see **Plan 02**.
