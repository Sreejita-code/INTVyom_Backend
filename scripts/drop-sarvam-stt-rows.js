// One-time cleanup: remove the retired `sarvam_stt` integration rows.
//
// Sarvam issues one API key for both STT and TTS, so STT now reads the ordinary `sarvam`
// row and `sarvam_stt` is no longer in the provider map. Any leftover row is unreachable —
// no lookup resolves to it and rotating it is a no-op — and its re-sync job would keep
// showing up in GET /resync-status for a provider that no longer exists.
//
// Idempotent, local DB only, no external calls. Run once:
//   node scripts/drop-sarvam-stt-rows.js
require('dotenv').config();
const mongoose = require('mongoose');

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected. Dropping sarvam_stt rows...');

  // Raw collections: the current provider map no longer knows this service_name.
  const integrations = await mongoose.connection
    .collection('integrations')
    .deleteMany({ service_name: 'sarvam_stt' });

  const jobs = await mongoose.connection
    .collection('resyncjobs')
    .deleteMany({ service_name: 'sarvam_stt' });

  console.log(`Done. Removed ${integrations.deletedCount} integration(s) and ${jobs.deletedCount} re-sync job(s).`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error('Cleanup failed:', err.message);
  process.exit(1);
});
