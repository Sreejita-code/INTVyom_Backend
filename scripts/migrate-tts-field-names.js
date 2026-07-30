// One-time rename: assistant `model`/`config` -> `tts_model`/`tts_config`, so the TTS slot
// matches the `stt_model`/`stt_config` convention. The key-rotation re-sync query matches on
// `tts_model`, so legacy docs are invisible to it until this runs.
//
// Idempotent (a doc without the old fields is left alone), local DB only, no external calls.
// Run once, before deploying the renamed code:
//   node scripts/migrate-tts-field-names.js
require('dotenv').config();
const mongoose = require('mongoose');

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected. Renaming model -> tts_model, config -> tts_config...');

  // Raw collection: $rename on fields the current schema no longer declares.
  const collection = mongoose.connection.collection('assistants');

  const result = await collection.updateMany(
    { $or: [{ model: { $exists: true } }, { config: { $exists: true } }] },
    { $rename: { model: 'tts_model', config: 'tts_config' } }
  );

  console.log(`Done. Renamed fields on ${result.modifiedCount} assistant(s).`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
