// Migration for the STT config breaking change (LiveKit Agents API update).
//
// The external API moved STT selection out of `assistant_interaction_config`:
//   - retired:  interaction_config.user_stt_provider, interaction_config.stt_api_key
//   - current:  top-level assistant_stt_model + assistant_stt_config
// Sending the retired keys now answers 422, and the legacy `assistant_stt_model: "openai"`
// value is silently rewritten to "native" at resolve time on the external side.
//
// This script brings local Assistant docs in line with the current API so a later
// update/re-sync PATCH does not 422:
//   1. interaction_config.user_stt_provider  -> top-level stt_model
//      ('sarvam' stays; 'openai'/'native' -> 'native')
//   2. interaction_config.stt_api_key        -> stt_config.api_key (merged, when sarvam)
//   3. legacy stt_model == 'openai'          -> 'native'
//   4. retired keys are removed from interaction_config
//
// Idempotent, local DB only, no external calls. Run once:
//   node scripts/migrate-stt-config.js
require('dotenv').config();
const mongoose = require('mongoose');
const Assistant = require('../src/modules/assistant/assistant.model');

const migrateOne = (doc) => {
  const updates = {};
  const unset = {};
  let changed = false;

  const interaction = doc.interaction_config || {};
  const legacyProvider = interaction.user_stt_provider;
  const legacyApiKey = interaction.stt_api_key;

  if (legacyProvider !== undefined) {
    const model =
      String(legacyProvider).toLowerCase() === 'sarvam' ? 'sarvam' : 'native';

    if (doc.stt_model !== model) {
      updates.stt_model = model;
      changed = true;
    }

    if (model === 'sarvam' && legacyApiKey) {
      const merged = { ...(doc.stt_config || {}) };
      if (!merged.api_key) {
        merged.api_key = legacyApiKey;
        updates.stt_config = merged;
        changed = true;
      }
    }

    unset['interaction_config.user_stt_provider'] = 1;
    unset['interaction_config.stt_api_key'] = 1;
    changed = true;
  } else if (doc.stt_model === 'openai') {
    // Docs: a legacy stt_model "openai" is rewritten to "native" on the external side.
    updates.stt_model = 'native';
    changed = true;
  }

  return { updates, unset, changed };
};

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected. Migrating legacy STT config fields...');

  const cursor = Assistant.find({}).cursor();

  let scanned = 0;
  let migrated = 0;
  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    scanned++;

    const { updates, unset, changed } = migrateOne(doc.toObject ? doc.toObject() : doc);
    if (!changed) continue;

    const op = { $unset: unset };
    if (Object.keys(updates).length > 0) op.$set = updates;
    await Assistant.updateOne({ _id: doc._id }, op);
    migrated++;
  }

  console.log(
    `Done. Scanned ${scanned} assistant(s), migrated ${migrated}.` +
    (migrated > 0 ? ' Re-run for idempotency check is safe.' : ' Nothing to do.')
  );
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
