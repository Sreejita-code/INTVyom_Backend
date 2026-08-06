const mongoose = require('mongoose');

const InboundContextStrategySchema = new mongoose.Schema({
  user_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  external_strategy_id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  type: { type: String, required: true, default: 'webhook' }
  // strategy_config is intentionally not mirrored: upstream merges headers key by key and
  // masks secret values on read, so a local copy is stale the moment anyone patches it.
  // list/details proxy upstream, which is the source of truth for config.
}, { timestamps: true });

module.exports = mongoose.model('InboundContextStrategy', InboundContextStrategySchema);