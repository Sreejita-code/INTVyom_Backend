/**
 * Realtime Gemini Template
 * Uses Gemini realtime model for full duplex conversation
 */
module.exports = {
  name: "Realtime Gemini Assistant",
  description: "A realtime assistant using Google's Gemini Live API",
  mode: "realtime",
  llm_config: {
    provider: "gemini",
    model: "gemini-3.1-flash-live-preview",
    voice: "Puck"
  },
  interaction_config: {
    speaks_first: true,
    filler_words: false, // Not available in realtime mode
    background_sound_enabled: true,
    thinking_sound_enabled: true
  }
};