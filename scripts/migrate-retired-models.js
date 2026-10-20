// One-time migration for models removed in upstream 1.6.0 (OpenAI retires them on 2027-04-01):
// moves stored assistants from gpt-5.1 to gpt-6-sol and from gpt-5.4-nano to gpt-6-luna, in
// assistant_llm_config.model and the duplex assistant_llm_config.backend_model.
//   node scripts/migrate-retired-models.js            # dry run: lists what would move
//   node scripts/migrate-retired-models.js --apply    # PATCH upstream, then update the mirror
//
// Upstream first, local second: a failed upstream PATCH leaves the mirror untouched, so the row
// is still listed on the next run. Idempotent — moved rows no longer match. Per-assistant
// failures are reported and the run continues. Exit 1 when any assistant failed to move.
// Delete this script once it has run in production and record it under "Applied migrations"
// in the README (AGENTS.md).
const mongoose = require('mongoose');
const connectDB = require('../src/core/db/dbConnect');
const Assistant = require('../src/core/db/schemas/assistant.model');
const User = require('../src/core/db/schemas/user.model');
const { callExternal } = require('../src/services/livekit/livekitService');
const { RETIRED_CASCADE_MODELS } = require('../src/assistant/assistant.rules');

const apply = process.argv.includes('--apply');

// The fields of assistant_llm_config to send: only the ones that hold a retired model.
const replacementsFor = (llmConfig) => {
  const patch = {};
  for (const field of ['model', 'backend_model']) {
    const replacement = RETIRED_CASCADE_MODELS[llmConfig?.[field]];
    if (replacement) patch[field] = replacement;
  }
  return patch;
};

const run = async () => {
  await connectDB();

  const retired = Object.keys(RETIRED_CASCADE_MODELS);
  const rows = await Assistant.find({
    $or: [{ 'llm_config.model': { $in: retired } }, { 'llm_config.backend_model': { $in: retired } }],
  });

  let moved = 0;
  let failed = 0;

  for (const row of rows) {
    const patch = replacementsFor(row.llm_config);
    const label = `${row.external_assistant_id} ${JSON.stringify(patch)}`;

    if (!apply) {
      console.log(`would move ${label}`);
      continue;
    }

    try {
      const user = await User.findById(row.user_id);
      if (!user?.api_key) throw new Error('owner has no API key');

      // Upstream merges assistant_llm_config key by key, so only the moved fields are sent.
      await callExternal(user.api_key, {
        method: 'patch',
        path: `/assistant/update/${row.external_assistant_id}`,
        data: { assistant_llm_config: patch },
        fallback: 'Failed to move retired model',
      });

      await Assistant.updateOne(
        { _id: row._id },
        { $set: Object.fromEntries(Object.entries(patch).map(([field, value]) => [`llm_config.${field}`, value])) }
      );
      moved += 1;
      console.log(`moved ${label}`);
    } catch (err) {
      failed += 1;
      console.log(`FAILED ${label}: ${err.message}`);
    }
  }

  console.log(
    apply
      ? `\n${moved} moved, ${failed} failed.`
      : `\n${rows.length} assistant(s) would move. Re-run with --apply to PATCH upstream and update the mirror.`
  );

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
};

run().catch(async (err) => {
  console.error(`migrate-retired-models failed: ${err.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
