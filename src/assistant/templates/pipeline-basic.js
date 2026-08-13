/**
 * Basic Pipeline Template
 * Uses OpenAI LLM with Cartesia TTS and Sarvam STT
 */
module.exports = {
  name: "Basic Pipeline Assistant",
  description: "A simple pipeline assistant using OpenAI LLM with Cartesia TTS",
  mode: "pipeline",
  llm_config: {
    provider: "openai",
    model: "gpt-realtime-1.5"
  },
  tts_model: "cartesia",
  tts_config: {
    voice_id: "YOUR_CARTESIA_VOICE_ID"
  },
  stt_model: "sarvam",
  stt_config: {
    model: "saaras:v3",
    language: "unknown",
    mode: "codemix"
  },
  interaction_config: {
    speaks_first: true,
    filler_words: false,
    background_sound_enabled: true,
    thinking_sound_enabled: true
  }
};