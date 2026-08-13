/**
 * Customer Support Template
 * Optimized for customer support use cases
 */
module.exports = {
  name: "Customer Support Assistant",
  description: "A customer support assistant with end-call functionality",
  mode: "pipeline",
  llm_config: {
    provider: "openai",
    model: "gpt-4.1"
  },
  tts_model: "elevenlabs",
  tts_config: {
    voice_id: "YOUR_ELEVENLABS_VOICE_ID"
  },
  stt_model: "elevenlabs",
  stt_config: {
    model: "scribe_v2_realtime",
    no_verbatim: true
  },
  interaction_config: {
    speaks_first: true,
    filler_words: false,
    silence_reprompts: true,
    silence_reprompt_interval: 10.0,
    silence_max_reprompts: 2,
    background_sound_enabled: true,
    thinking_sound_enabled: true,
    allow_interruptions: false,
    input_guard_window_sec: 3.0
  },
  end_call_enabled: true,
  end_call_trigger_phrase: "goodbye",
  end_call_agent_message: "Thank you for calling. Have a great day!"
};