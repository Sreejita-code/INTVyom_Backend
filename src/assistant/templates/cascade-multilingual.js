/**
 * Cascade Multilingual Template
 * Uses cascade mode with multilingual support
 */
module.exports = {
  name: "Multilingual Cascade Assistant",
  description: "A cascade assistant with multilingual STT and TTS",
  mode: "cascade",
  llm_config: {
    provider: "openai",
    model: "gpt-5-mini",
    reasoning_effort: "low"
  },
  tts_model: "sarvam",
  tts_config: {
    speaker: "aayan",
    target_language_code: "en-IN",
    pace: 1.0
  },
  stt_model: "deepgram",
  stt_config: {
    model: "nova-3",
    language: "multi",
    enable_diarization: false
  },
  interaction_config: {
    speaks_first: true,
    filler_words: true,
    background_sound_enabled: true,
    thinking_sound_enabled: true,
    preferred_languages: ["en-US", "hi-IN"]
  }
};