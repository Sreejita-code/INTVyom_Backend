const mongoose = require('mongoose');

const SipTrunkSchema = new mongoose.Schema({
  user_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  external_trunk_id: { type: String, required: true }, // The trunk_id from LiveKit
  trunk_name: { type: String, required: true },
  trunk_type: { type: String, enum: ['twilio', 'exotel'], required: true },
  
  // Mixed type allows storing either Twilio's config (address, numbers, username, password) 
  // or Exotel's config (exotel_number) flexibly in the same column
  trunk_config: { type: mongoose.Schema.Types.Mixed, required: true } 
}, { timestamps: true });

module.exports = mongoose.model('SipTrunk', SipTrunkSchema);