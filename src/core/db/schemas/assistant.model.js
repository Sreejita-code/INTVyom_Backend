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
    enum: ['pipeline', 'realtime', 'cascade'],
    default: 'pipeline'
  },
  llm_provider: {
    type: String,
    enum: ['openai', 'gemini'],
    default: 'openai'
  },
  llm_config: { type: Object },
  // tts_* mirrors stt_* — one naming convention for both provider slots.
  // Legacy `model`/`config` docs were migrated once; see "Applied migrations" in the README.
  tts_model: { type: String },
  tts_config: { type: Object },
  stt_model: { type: String },
  stt_config: { type: Object },
  prompt: { type: String, required: true },
  start_instruction: { type: String },

  // Mirrors assistant_interaction_config on the external API. Every upstream key is
  // declared here — an undeclared path is silently dropped by mongoose, which would
  // make local_data disagree with the external truth. Defaults match upstream defaults.
  interaction_config: {
    speaks_first: { type: Boolean, default: true },
    filler_words: { type: Boolean, default: false },
    silence_reprompts: { type: Boolean, default: false },
    silence_reprompt_interval: { type: Number, default: 10.0 },
    silence_max_reprompts: { type: Number, default: 2 },
    background_sound_enabled: { type: Boolean, default: true },
    thinking_sound_enabled: { type: Boolean, default: true },
    allow_interruptions: { type: Boolean, default: false },
    input_guard_window_sec: { type: Number, default: 3.0 },
    // null/unset => platform default of 30 minutes applies.
    max_call_duration_minutes: { type: Number, default: null },
    // BCP-47 codes, e.g. ['hi-IN', 'en-US']. Empty = STT auto-detects.
    // Distinct from tts_config.target_language_code, which is a single string.
    preferred_languages: { type: [String], default: [] }
  },

  greeting_audio: { type: Object },
  end_call_enabled: { type: Boolean, default: false },
  end_call_trigger_phrase: { type: String },
  end_call_agent_message: { type: String },
  end_call_url: { type: String } 
}, { timestamps: true }); 

module.exports = mongoose.model('Assistant', AssistantSchema);