const mongoose = require('mongoose');

const IntegrationSchema = new mongoose.Schema({
  user_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  service_type: { 
    type: String, 
    required: true,
    enum: ['TTS', 'LLM'],
    default: 'TTS'
  },
  service_name: { 
    type: String, 
    required: true,
    lowercase: true // Normalizes names like 'Sarvam' to 'sarvam'
  },
  api_key: { 
    type: String, 
    required: true 
  }
}, { timestamps: true });

// Enforce one API key per user per service_name
IntegrationSchema.index({ user_id: 1, service_name: 1 }, { unique: true });

module.exports = mongoose.model('Integration', IntegrationSchema);
