const mongoose = require('mongoose');

const InboundContextStrategySchema = new mongoose.Schema({
  user_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  external_strategy_id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  type: { type: String, required: true, default: 'webhook' },
  strategy_config: { type: Object, required: true }, // Stores URL, headers, etc.
  is_active: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('InboundContextStrategy', InboundContextStrategySchema);