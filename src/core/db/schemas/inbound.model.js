const mongoose = require('mongoose');

const InboundSchema = new mongoose.Schema({
  user_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  external_inbound_id: { type: String, required: true, unique: true },
  
  // We store both local ref and external ID for flexibility
  assistant_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Assistant', default: null },
  external_assistant_id: { type: String, default: null },
  
  inbound_context_strategy_id: { type: String, default: null }, // Stored as string since we don't have a strategy model yet
  
  service: { type: String, required: true },
  phone_number: { type: String, required: true },
  phone_number_normalized: { type: String, required: true },
  inbound_config: { type: Object, required: true }
}, { timestamps: true });

module.exports = mongoose.model('Inbound', InboundSchema);