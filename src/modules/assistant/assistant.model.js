const mongoose = require('mongoose');

const AssistantSchema = new mongoose.Schema({
  user_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  external_assistant_id: { type: String, required: true },
  name: { type: String, required: true },
  description: { type: String, required: true }, // Made required as per schema
  model: { type: String, required: true }, 
  config: { type: Object, required: true },      // Made required as per schema
  prompt: { type: String, required: true },      // Made required as per schema
  start_instruction: { type: String },           // Optional
  
  // New Interaction Config with defaults
  interaction_config: {
    speaks_first: { type: Boolean, default: true },
    filler_words: { type: Boolean, default: false },
    silence_reprompts: { type: Boolean, default: false },
    silence_reprompt_interval: { type: Number, default: 10.0 },
    silence_max_reprompts: { type: Number, default: 2 }
  },

  // New End Call Configs
  end_call_enabled: { type: Boolean, default: false },
  end_call_trigger_phrase: { type: String },
  end_call_agent_message: { type: String },
  end_call_url: { type: String } 
}, { timestamps: true });

module.exports = mongoose.model('Assistant', AssistantSchema);