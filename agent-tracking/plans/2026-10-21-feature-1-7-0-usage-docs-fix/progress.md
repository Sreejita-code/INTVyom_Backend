# Progress

- Steps 1-3: `swagger.yaml` usage description (real `model_usage` shape, pre-1.7.0 `llm_usage` trap, `pricing_schema_version` 2, tier pricing), call-log example gained `model_usage` and `pricing_schema_version`, webhook `call_end_reason` lists four values.
- Steps 4-5: `docs/ASSISTANT-RULES.md` `call_end_reason` four values; duplex bullet rewritten, tier bullet split out.
- Step 6: `docs/CHANGELOG.md` wrong "Docs:" line corrected (notes the invented keys do not exist); `call_end_reason` line added. No new heading.
- Verify: `npm test` 186/186 pass; swagger loads; grep for `estimated_cost_voice|estimated_cost_backend|voice_model` in swagger.yaml and docs finds only the deliberate "do not exist" notes.
- README not changed (no endpoint/env/script/structure change). AGENTS.md pack block and CLAUDE.md import already present.
- No commit made.

## Out-of-scope observations
- None.
