const mongoose = require('mongoose');

// Tracks the background re-sync of assistants after an Integration key rotation.
// One current job per (user, service_name) — overwritten on each run, no history kept.
const ResyncJobSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  service_name: {
    type: String,
    required: true,
    lowercase: true
  },
  status: {
    type: String,
    enum: ['running', 'completed', 'error'],
    default: 'running'
  },
  total: { type: Number, default: 0 },
  processed: { type: Number, default: 0 },
  succeeded: { type: Number, default: 0 },
  failed: [{
    assistant_id: { type: String },
    error: { type: String }
  }],
  error: { type: String, default: null }
}, { timestamps: true });

ResyncJobSchema.index({ user_id: 1, service_name: 1 }, { unique: true });

module.exports = mongoose.model('ResyncJob', ResyncJobSchema);
