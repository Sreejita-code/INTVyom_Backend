const mongoose = require('mongoose');

const AssistantSchema = new mongoose.Schema({
  user_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  external_assistant_id: { type: String, required: true },
  name: { type: String, required: true },
  description: { type: String },
  model: { type: String, required: true }, 
  config: { type: Object }, 
  prompt: { type: String },
  start_instruction: { type: String },
  end_call_url: { type: String } // Added optional field
}, { timestamps: true });

module.exports = mongoose.model('Assistant', AssistantSchema);