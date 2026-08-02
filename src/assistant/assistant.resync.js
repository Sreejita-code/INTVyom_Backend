/**
 * Re-sync assistants after an Integration key is rotated.
 *
 * A provider key is snapshotted into each assistant on the external side at create/update time.
 * When the user stores a new key, push it to every existing assistant that uses that provider
 * (LLM matched by llm_provider, STT by stt_model, TTS by tts_model). Assistants that carry their
 * own per-assistant api_key are left alone — an Integration key rotation is irrelevant to them.
 */
const Assistant = require('../core/db/schemas/assistant.model');
const { callExternal } = require('../services/livekit/livekitService');
const { classify } = require('../integration/providers');
const { buildLlmConfig, buildPipelineTtsConfig, buildPipelineSttConfig } = require('./assistant.builder');

const RESYNC_CONCURRENCY = 10; // ponytail: tune to LiveKit's rate limit

// Re-push one assistant's config with the freshly-stored key. `kinds` is the set of
// slots this rotation affects for this assistant — a shared vendor key (sarvam backs
// both TTS and STT) can touch more than one, and they go out in a single PATCH.
// Returns 'skipped' when every affected slot carries its own key, else 'synced'.
const resyncOne = async (user, a, kinds) => {
  const payload = {};

  for (const kind of kinds) {
    if (kind === 'llm') {
      if (a.llm_config?.api_key?.trim()) continue;
      payload.assistant_llm_config = await buildLlmConfig({
        userId: user._id,
        llmConfig: a.llm_config,
        provider: a.llm_provider
      });
    } else if (kind === 'stt') {
      if (a.stt_config?.api_key?.trim()) continue;
      payload.assistant_stt_model = a.stt_model;
      payload.assistant_stt_config = await buildPipelineSttConfig({
        userId: user._id,
        sttModel: a.stt_model,
        sttConfig: a.stt_config
      });
    } else {
      if (a.tts_config?.api_key?.trim()) continue;
      payload.assistant_tts_model = a.tts_model;
      payload.assistant_tts_config = await buildPipelineTtsConfig({
        userId: user._id,
        ttsModel: a.tts_model,
        ttsConfig: a.tts_config
      });
    }
  }

  if (Object.keys(payload).length === 0) return 'skipped';

  await callExternal(user.api_key, {
    method: 'patch',
    path: `/assistant/update/${a.external_assistant_id}`,
    data: payload,
    fallback: 'Failed to re-sync assistant',
  });
  return 'synced';
};

// Batched, best-effort. Calls onProgress({total,processed,succeeded,failed}) once up front and
// after each batch so a background caller can persist progress. Returns the final summary.
const resyncAssistantsForIntegration = async ({ user, serviceName, onProgress }) => {
  if (!user?.api_key) return { total: 0, succeeded: 0, failed: [] }; // no external assistants possible

  // What this row is good for comes from the provider map, so a shared key rotation
  // (e.g. `sarvam`) reaches both the TTS and the STT slot instead of only TTS.
  const targets = classify(serviceName);
  if (!targets) return { total: 0, succeeded: 0, failed: [] };

  const MATCH_FIELD = { llm: 'llm_provider', stt: 'stt_model', tts: 'tts_model' };
  const jobs = new Map(); // assistant id -> { assistant, kinds } so each gets one PATCH
  for (const { kind, model } of targets) {
    const matched = await Assistant.find({ user_id: user._id, [MATCH_FIELD[kind]]: model });
    for (const a of matched) {
      const id = String(a._id);
      if (!jobs.has(id)) jobs.set(id, { assistant: a, kinds: [] });
      jobs.get(id).kinds.push(kind);
    }
  }
  const assistants = [...jobs.values()];

  const total = assistants.length;
  let processed = 0;
  let succeeded = 0;
  const failed = [];
  if (onProgress) await onProgress({ total, processed, succeeded, failed });

  for (let i = 0; i < assistants.length; i += RESYNC_CONCURRENCY) {
    const batch = assistants.slice(i, i + RESYNC_CONCURRENCY);
    const results = await Promise.allSettled(batch.map(j => resyncOne(user, j.assistant, j.kinds)));
    results.forEach((r, k) => {
      processed++;
      if (r.status === 'fulfilled') {
        if (r.value === 'synced') succeeded++;
      } else {
        failed.push({ assistant_id: batch[k].assistant.external_assistant_id, error: r.reason.message });
      }
    });
    if (onProgress) await onProgress({ total, processed, succeeded, failed });
  }

  return { total, succeeded, failed };
};

module.exports = { resyncAssistantsForIntegration };
