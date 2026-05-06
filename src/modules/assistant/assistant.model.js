const mongoose = require('mongoose'); 

const AssistantSchema = new mongoose.Schema({
  user_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  external_assistant_id: { type: String, required: true },
  name: { type: String, required: true },
  description: { type: String, required: true },
  llm_mode: {
    type: String,
    enum: ['pipeline', 'realtime'],
    default: 'pipeline'
  },
  llm_config: { type: Object },
  model: { type: String },
  config: { type: Object },
  prompt: { type: String, required: true },     
  start_instruction: { type: String },          
  
  // UPDATED: Interaction Config with new fields
  interaction_config: {
    speaks_first: { type: Boolean, default: true },
    filler_words: { type: Boolean, default: false },
    silence_reprompts: { type: Boolean, default: false },
    silence_reprompt_interval: { type: Number, default: 10.0 },
    silence_max_reprompts: { type: Number, default: 2 },
    background_sound_enabled: { type: Boolean, default: false }, // New
    thinking_sound_enabled: { type: Boolean, default: false },   // New
    preferred_languages: { type: [String], default: [] }         // New
  },
  
  end_call_enabled: { type: Boolean, default: false },
  end_call_trigger_phrase: { type: String },
  end_call_agent_message: { type: String },
  end_call_url: { type: String } 
}, { timestamps: true }); 

module.exports = mongoose.model('Assistant', AssistantSchema);