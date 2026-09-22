/**
 * Realtime Gemini Template
 * Uses Gemini realtime model for full duplex conversation.
 * `gemini-3.8-live` is the upstream default — the stable low-latency line Google names for
 * voice agents, and the one every platform feature (greeting, farewell, re-prompts) works on.
 */
module.exports = {
  name: "Realtime Gemini Assistant",
  description: "A realtime assistant using Google's Gemini Live API",
  mode: "realtime",
  llm_config: {
    provider: "gemini",
    model: "gemini-3.8-live",
    voice: "Puck"
  },
  interaction_config: {
    speaks_first: true,
    filler_words: false, // Not available in realtime mode
    background_sound_enabled: true,
    thinking_sound_enabled: true
  }
};