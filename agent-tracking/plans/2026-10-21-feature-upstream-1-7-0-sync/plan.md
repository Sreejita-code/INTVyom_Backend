# Plan — upstream 1.7.0 sync

Goal: mirror upstream's Gemini realtime refusal locally and document 1.7.0.

Steps
- [ ] 1. `src/assistant/assistant.rules.js`: add and export `GEMINI_REFUSED_KNOBS`.
- [ ] 2. `src/assistant/assistant.validation.js`: in `validateModelParameters`, realtime+gemini branch before the non-openai early return.
- [ ] 3. Tests: `tests/assistant/validation.test.js` (refusal, allowed knobs, openai unchanged, pipeline gemini unchanged) and `tests/assistant/update.test.js` (stored row: rename refused, null repairs, nothing sent upstream on refusal).
- [ ] 4. Docs: `docs/ASSISTANT-RULES.md`, `docs/UPSTREAM.md`, `docs/CHANGELOG.md`, `swagger.yaml`.
- [ ] 5. Verify: `npm test`, `node --check`, swagger yaml load.
- [ ] 6. Report.

Deliberately not doing: a migration script (upstream gives the same refusal, `null` repairs; stored-row count unknown, offer a read-only audit if wanted); duplex code; service-tier pricing; local pricing/usage code (passthrough).

Risks: refusing on merged row locks a stored row out of rename. Mitigation: matches upstream 1.7.0 ("422 on next update until removed"), message names the repair (`null`). Rollback: revert the validation branch; one function.
