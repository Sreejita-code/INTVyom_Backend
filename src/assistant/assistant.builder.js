/**
 * External-payload construction for assistant TTS/STT/LLM configs. The only I/O
 * here is provider API-key resolution; everything else is pure shaping.
 */
const { keyNameFor, resolveApiKey, modelsFor } = require('../integration/providers');
const { badRequest } = require('./assistant.rules');

// TTS/STT keys always come from the Integrations module — any caller-supplied api_key
// is overwritten. Models with no entry in the provider map (e.g. stt `native`) need no
// key, so their config is forwarded verbatim.
const buildPipelineTtsConfig = async ({ userId, ttsModel, ttsConfig }) => {
  const finalTtsConfig = ttsConfig ? { ...ttsConfig } : undefined;

  if (keyNameFor('tts', ttsModel)) {
    const apiKey = await resolveApiKey({ userId, kind: 'tts', name: ttsModel, label: ttsModel });
    if (!finalTtsConfig) return { api_key: apiKey };
    finalTtsConfig.api_key = apiKey;
  }

  return finalTtsConfig;
};

const buildPipelineSttConfig = async ({ userId, sttModel, sttConfig }) => {
  const finalSttConfig = sttConfig ? { ...sttConfig } : undefined;

  if (keyNameFor('stt', sttModel)) {
    const apiKey = await resolveApiKey({ userId, kind: 'stt', name: sttModel, label: sttModel });
    if (!finalSttConfig) return { api_key: apiKey };
    finalSttConfig.api_key = apiKey;
  }

  return finalSttConfig;
};

// Provider resolution is mode-aware:
// - realtime accepts gemini (default) or openai
// - pipeline is openai-only: pipeline is a half-cascade, which needs the realtime model in a
//   text-only response modality, and Google's Live API cannot do that on its native-audio models
// - cascade only allows openai
//
// The gemini/pipeline and non-openai/cascade rejections fire only when the caller is actively
// choosing the combination — an explicit provider, or an explicit mode. A PATCH that touches
// neither (a rename on an assistant stored with the retired gemini/pipeline pairing) resolves the
// stored provider and passes through: that request does not forward assistant_llm_config at all,
// so failing it would lock the user out of editing the assistant instead of helping them fix it.
const resolveProvider = ({ llmConfig, existing, mode, modeExplicit = false }) => {
  const defaultByMode = mode === 'realtime' ? 'gemini' : 'openai';
  const explicitProvider = llmConfig?.provider;
  let raw;

  if (explicitProvider !== undefined) {
    raw = explicitProvider;
  } else if (modeExplicit) {
    raw = defaultByMode;
  } else {
    raw = existing?.llm_provider ?? existing?.llm_config?.provider ?? defaultByMode;
  }

  const provider = raw ? String(raw).toLowerCase() : defaultByMode;
  const callerChoseIt = explicitProvider !== undefined || modeExplicit;

  if (mode === 'cascade' && provider !== 'openai' && callerChoseIt) {
    throw badRequest("assistant_llm_config.provider must be 'openai' in cascade mode");
  }
  if (mode === 'pipeline' && provider === 'gemini' && callerChoseIt) {
    throw badRequest(
      "assistant_llm_config.provider 'gemini' is not supported in pipeline mode — " +
      "use assistant_mode 'realtime' for Gemini, or provider 'openai' for pipeline"
    );
  }
  if (!keyNameFor('llm', provider)) {
    const allowed = modelsFor('llm').map((p) => `'${p}'`).join(' or ');
    throw badRequest(`assistant_llm_config.provider must be ${allowed}`);
  }
  return provider;
};

// Build the assistant_llm_config sent to the external API for any mode.
// Injects the resolved provider and resolves the api_key: caller-supplied key wins, otherwise
// pull the user's integrated key for that provider. In pipeline mode the key is optional — the
// external API can fall back to its own system key — so callers may mark it as not required.
const buildLlmConfig = async ({ userId, llmConfig, provider, keyRequired = true }) => {
  const finalLlmConfig = { ...(llmConfig || {}), provider };

  const hasPerAssistantKey = typeof finalLlmConfig.api_key === 'string' && finalLlmConfig.api_key.trim() !== '';
  if (!hasPerAssistantKey) {
    const apiKey = await resolveApiKey({ userId, kind: 'llm', name: provider, required: keyRequired });
    if (apiKey) finalLlmConfig.api_key = apiKey;
    else delete finalLlmConfig.api_key;
  }

  return finalLlmConfig;
};

module.exports = {
  buildPipelineTtsConfig,
  buildPipelineSttConfig,
  resolveProvider,
  buildLlmConfig,
};
