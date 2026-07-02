// One-time backfill: set `llm_provider` on assistants created before the field existed.
// Without this, the key-rotation re-sync query { llm_provider } cannot match legacy docs
// (Mongo doesn't match a missing field; the schema default only applies to new inserts).
//
// Idempotent, local DB only, no external calls. Run once:
//   node scripts/backfill-llm-provider.js
require('dotenv').config();
const mongoose = require('mongoose');
const Assistant = require('../src/modules/assistant/assistant.model');

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected. Backfilling llm_provider...');

  // Only touch docs that don't already have the field.
  const cursor = Assistant.find({ llm_provider: { $exists: false } }).cursor();

  let updated = 0;
  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    const raw = doc.llm_config?.provider;
    const provider = raw && String(raw).toLowerCase() === 'gemini' ? 'gemini' : 'openai';
    await Assistant.updateOne({ _id: doc._id }, { $set: { llm_provider: provider } });
    updated++;
  }

  console.log(`Done. Backfilled ${updated} assistant(s).`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error('Backfill failed:', err.message);
  process.exit(1);
});
