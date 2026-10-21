# Agent Tracking Index

One row per task. Newest at the bottom. Keep status current at every phase change.

Status: `scoping` · `researching` · `awaiting-approval` · `approved` · `in-progress` · `done` · `blocked` · `cancelled`

| Date | Slug | Type | Status | Summary | Report |
|------|------|------|--------|---------|--------|
| 2026-10-20 | 2026-10-20-audit-upstream-1-6-0-drift | audit | done | Drift audit of the proxy against upstream api-livekit-docs 1.6.0 (new duplex mode, model changes, new endpoints): gaps, security, validation | reports/2026-10-20-audit-upstream-1-6-0-drift.html |
| 2026-10-20 | 2026-10-20-feature-upstream-1-6-0-sync | feature | done | Sync proxy with upstream 1.6.0: duplex mode, model lists, TTS rules, repair path, migration | - |
| 2026-10-20 | 2026-10-20-feature-docs-split-and-internals-mcp | feature | done | Split docs (README run-only, DEVELOPERS.md internals, swagger MCP) and add internals/changes MCP tools | reports/2026-10-20-feature-docs-split-and-internals-mcp.html |
| 2026-10-21 | 2026-10-21-audit-upstream-1-7-0-drift | audit | done | Drift check of the proxy against upstream api-livekit-docs 1.7.0 (Gemini refused knobs, duplex settings, service tiers) | reports/2026-10-21-feature-upstream-1-7-0-sync.html |
| 2026-10-21 | 2026-10-21-feature-upstream-1-7-0-sync | feature | done | Mirror upstream 1.7.0: Gemini realtime refused knobs, docs, swagger | reports/2026-10-21-feature-upstream-1-7-0-sync.html |
| 2026-10-21 | 2026-10-21-audit-1-7-0-duplex-call-log-recheck | audit | done | Recheck 1.7.0 duplex call-log/usage changes (voice_llm_usage/backend_llm_usage types, cost split) against proxy | reports/2026-10-21-audit-1-7-0-duplex-call-log-recheck.html |
| 2026-10-21 | 2026-10-21-feature-1-7-0-usage-docs-fix | feature | done | Fix duplex usage docs (invented keys, model_usage types, call_end_reason) in swagger and docs | plans/2026-10-21-feature-1-7-0-usage-docs-fix/progress.md |
