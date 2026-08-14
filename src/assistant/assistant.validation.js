/**
 * Enhanced validation service for assistant configurations.
 * Provides comprehensive validation for provider combinations, model parameters, 
 * and language codes with improved error messages and suggestions.
 */
const { 
  OPENAI_REALTIME_MODELS, 
  OPENAI_CASCADE_MODELS, 
  CASCADE_STT_MODELS, 
  PIPELINE_STT_MODELS,
  GEMINI_LIVE_MODELS,
  SERVICE_TIERS,
  TOOL_CHOICES,
} = require('./assistant.rules');

// Language code standards by provider
const LANGUAGE_STANDARDS = {
  sarvam: { standard: 'BCP-47 Indic', example: 'en-IN, hi-IN' },
  cartesia: { standard: 'ISO 639-1', example: 'en, hi' },
  deepgram: { standard: 'BCP-47', example: 'en-US, hi-IN' },
  elevenlabs: { standard: 'ISO 639-3', example: 'eng, hin' },
  openai: { standard: 'ISO 639-1', example: 'en, hi' }
};

// Valid language codes by provider
const VALID_LANGUAGE_CODES = {
  sarvam: ['as-IN', 'bn-IN', 'brx-IN', 'doi-IN', 'en-IN', 'gu-IN', 'hi-IN', 'kn-IN', 'kok-IN', 'ks-IN', 'mai-IN', 'ml-IN', 'mni-IN', 'mr-IN', 'ne-IN', 'od-IN', 'pa-IN', 'sa-IN', 'sat-IN', 'sd-IN', 'ta-IN', 'te-IN', 'ur-IN', 'unknown'],
  cartesia: ['en', 'de', 'es', 'fr', 'ja', 'pt', 'zh', 'hi', 'ko', 'it', 'nl', 'pl', 'ru', 'sv', 'tr', 'tl', 'bg', 'ro', 'ar', 'cs', 'el', 'fi', 'hr', 'ms', 'sk', 'da', 'ta', 'uk', 'hu', 'no', 'vi', 'bn', 'th', 'he', 'ka', 'id', 'te', 'gu', 'kn', 'ml', 'mr', 'or', 'pa'],
  deepgram: null, // Deepgram accepts many BCP-47 codes
  elevenlabs: null, // ElevenLabs auto-detects ~190 languages
  openai: null // OpenAI accepts ISO 639-1 codes
};

// Model families for parameter validation. Mirror of api_livekit's
// src/core/agents/llm_capabilities.py — membership is spelled out per model and matched
// exactly, never by prefix. A prefix test reads every '*-chat-latest' id as a reasoning
// model (they all start with 'gpt-5') *and* as a chat model, so both temperature and
// reasoning_effort were rejected for them and there was no accepted way to configure one.
// When upstream adds a model, add it to the same list here.

// Reasoning models: take `reasoning_effort`, reject `temperature`.
const REASONING_MODELS = [
  'gpt-5', 'gpt-5-mini', 'gpt-5-nano',
  'gpt-5.1', 'gpt-5.2', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano',
  'gpt-5.5', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'
];

// Non-reasoning chat models: `temperature` yes, `reasoning_effort` no. The retired
// `*-chat-latest` aliases, `chat-latest` and `gpt-oss-120b` are NOT here: they are off the
// cascade allowlist (retired 2026-06-19 / never served by api.openai.com), and a model outside
// the allowlist has no known family, so its knobs are forwarded untouched rather than guessed at.
const CHAT_MODELS = [
  'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano',
  'gpt-4o', 'gpt-4o-mini',
];

// `verbosity` (`text.verbosity`) is a gpt-5 generation parameter. With the retired chat aliases
// gone from the allowlist, the gpt-5 generation is exactly the reasoning family.
const GPT5_GENERATION = [...REASONING_MODELS];

// Reasoning models that reject `reasoning_effort` once function tools are attached.
const REASONING_TOOL_INCOMPATIBLE = ['gpt-5.2', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano'];

/**
 * Why this generation knob cannot go to this model, or null when the model reads it.
 * Same table and same wording as the upstream 422 so all three layers agree.
 * An unknown model — one outside both families — gets null for every knob rather than a
 * guess; guessing is what the prefix test used to do.
 * @param {string} model - The model ID
 * @param {'temperature'|'reasoning_effort'|'verbosity'} knob - The parameter
 * @param {boolean} hasTools - Whether the session will attach function tools
 * @returns {string|null} The reason, or null when the pairing is fine
 */
const unsupportedKnobReason = (model, knob, hasTools = false) => {
  const isReasoning = REASONING_MODELS.includes(model);
  const isChat = CHAT_MODELS.includes(model);
  if (!isReasoning && !isChat) {
    return null;
  }

  if (knob === 'temperature' && isReasoning) {
    return 'reasoning models reject temperature — set reasoning_effort instead';
  }

  if (knob === 'reasoning_effort') {
    if (!isReasoning) {
      return 'reasoning.effort is a reasoning-model parameter, and this is a chat model';
    }
    if (hasTools && REASONING_TOOL_INCOMPATIBLE.includes(model)) {
      return 'this model rejects reasoning.effort while function tools are attached';
    }
  }

  if (knob === 'verbosity' && !GPT5_GENERATION.includes(model)) {
    return 'text.verbosity is a gpt-5 generation parameter';
  }

  return null;
};

// Detailed compatibility matrix with restrictions and notes
const COMPATIBILITY_MATRIX = {
  pipeline: {
    llm: {
      providers: ['openai'],
      restrictions: {
        openai: {
          models: OPENAI_REALTIME_MODELS,
          notes: 'Uses OpenAI realtime models in text-only modality'
        }
      },
      forbidden: ['gemini'],
      notes: 'Gemini is not supported in pipeline mode because Google\'s Live API cannot run the text-only modality half-cascade needs on its native-audio models'
    },
    stt: {
      providers: PIPELINE_STT_MODELS,
      restrictions: {
        native: {
          notes: 'The conversational LLM transcribes itself (OpenAI gpt-4o-mini-transcribe, or Gemini\'s own on a Gemini pipeline)'
        },
        sarvam: {
          models: ['saaras:v3', 'saaras:v2.5', 'saarika:v2.5'],
          notes: 'Runs Sarvam Saras v3 as a parallel audio tap for native-script Indic transcripts'
        }
      },
      notes: 'Cascade-only providers (cartesia, deepgram, elevenlabs, openai) are accepted but degrade to native transcription'
    },
    tts: {
      providers: ['cartesia', 'sarvam', 'elevenlabs', 'mistral'],
      restrictions: {
        cartesia: {
          models: ['sonic-3'],
          notes: 'Fixed model; sonic-3.5 requires LiveKit Cloud credentials'
        },
        sarvam: {
          models: ['bulbul:v3'],
          notes: 'Speaker must be from bulbul:v3 roster'
        }
      }
    }
  },
  realtime: {
    llm: {
      providers: ['gemini', 'openai'],
      restrictions: {
        gemini: {
          models: GEMINI_LIVE_MODELS,
          notes: 'Validated against the plugin Live list; default model: gemini-2.5-flash-native-audio-preview-12-2025'
        },
        openai: {
          models: OPENAI_REALTIME_MODELS,
          notes: 'Default model: gpt-realtime-1.5'
        }
      }
    },
    stt: {
      providers: null,
      notes: 'STT is ignored in realtime mode - the model always transcribes itself'
    },
    tts: {
      providers: null,
      notes: 'TTS is ignored in realtime mode - the model produces its own audio'
    }
  },
  cascade: {
    llm: {
      providers: ['openai'],
      restrictions: {
        openai: {
          models: OPENAI_CASCADE_MODELS,
          notes: 'Uses openai.responses.LLM - cheaper than chat-completions, same @function_tool contract'
        }
      },
      forbidden: ['gemini'],
      notes: 'Gemini is not supported in cascade mode - there is no realtime model to transcribe itself'
    },
    stt: {
      providers: CASCADE_STT_MODELS,
      forbidden: ['native'],
      restrictions: {
        sarvam: {
          models: ['saaras:v3', 'saaras:v2.5', 'saarika:v2.5']
        },
        cartesia: {
          models: ['ink-whisper', 'ink-2']
        },
        deepgram: {
          models: ['nova-3', 'nova-2', 'flux-general-en', 'flux-general-multi']
        },
        elevenlabs: {
          models: ['scribe_v2_realtime', 'scribe_v2', 'scribe_v1']
        },
        openai: {
          models: ['gpt-4o-mini-transcribe', 'gpt-4o-transcribe', 'whisper-1']
        }
      },
      notes: 'Native STT is rejected - there is no realtime model to transcribe itself'
    },
    tts: {
      providers: ['cartesia', 'sarvam', 'elevenlabs', 'mistral'],
      restrictions: {
        cartesia: {
          models: ['sonic-3']
        },
        sarvam: {
          models: ['bulbul:v3']
        }
      }
    }
  }
};

// Provider compatibility matrix
const PROVIDER_COMPATIBILITY = {
  pipeline: {
    llm: ['openai'], // gemini rejected in pipeline mode
    stt: PIPELINE_STT_MODELS,
    tts: ['cartesia', 'sarvam', 'elevenlabs', 'mistral']
  },
  realtime: {
    llm: ['gemini', 'openai'],
    stt: null, // STT is ignored in realtime mode
    tts: null  // TTS is ignored in realtime mode
  },
  cascade: {
    llm: ['openai'], // only openai allowed in cascade mode
    stt: CASCADE_STT_MODELS,
    tts: ['cartesia', 'sarvam', 'elevenlabs', 'mistral']
  }
};

/**
 * Validates provider combinations for a given mode
 * @param {string} mode - The assistant mode (pipeline, realtime, cascade)
 * @param {string} llmProvider - The LLM provider
 * @param {string} sttProvider - The STT provider
 * @param {string} ttsProvider - The TTS provider
 * @returns {object} Validation result with isValid flag and message
 */
const validateProviderCombination = (mode, llmProvider, sttProvider, ttsProvider) => {
  const modeRules = PROVIDER_COMPATIBILITY[mode];
  const compatibilityInfo = COMPATIBILITY_MATRIX[mode];
  
  if (!modeRules) {
    return {
      isValid: false,
      message: `Invalid mode '${mode}'. Valid modes are: pipeline, realtime, cascade`
    };
  }
  
  // Validate LLM provider
  if (llmProvider && modeRules.llm && !modeRules.llm.includes(llmProvider)) {
    const forbidden = compatibilityInfo?.llm?.forbidden;
    const reason = forbidden && forbidden.includes(llmProvider) 
      ? compatibilityInfo.llm.notes 
      : '';
      
    return {
      isValid: false,
      message: `LLM provider '${llmProvider}' is not supported in ${mode} mode. ` +
               `Supported providers: ${modeRules.llm.join(', ')}` +
               (reason ? ` Reason: ${reason}` : '')
    };
  }
  
  // Validate STT provider
  if (sttProvider && modeRules.stt && !modeRules.stt.includes(sttProvider)) {
    const forbidden = compatibilityInfo?.stt?.forbidden;
    const reason = forbidden && forbidden.includes(sttProvider) 
      ? compatibilityInfo.stt.notes 
      : '';
      
    return {
      isValid: false,
      message: `STT provider '${sttProvider}' is not supported in ${mode} mode. ` +
               `Supported providers: ${modeRules.stt.join(', ')}` +
               (reason ? ` Reason: ${reason}` : '')
    };
  }
  
  // Validate TTS provider
  if (ttsProvider && modeRules.tts && !modeRules.tts.includes(ttsProvider)) {
    return {
      isValid: false,
      message: `TTS provider '${ttsProvider}' is not supported in ${mode} mode. ` +
               `Supported providers: ${modeRules.tts.join(', ')}`
    };
  }
  
  return { isValid: true, message: 'Valid provider combination' };
};

/**
 * Validates model parameters based on model family
 * @param {string} mode - The assistant mode
 * @param {string} provider - The provider
 * @param {string} model - The model ID
 * @param {object} parameters - Model parameters
 * @param {boolean} [hasTools] - Whether the assistant carries tools (tool_ids or end_call tool).
 *   Defaults to reading tool_ids/assistant_end_call_enabled from `parameters` for back-compat
 *   with the direct-call tests; the config flow passes the top-level flag.
 * @returns {object} Validation result with isValid flag and message
 */
const validateModelParameters = (mode, provider, model, parameters = {}, hasTools) => {
  if (provider !== 'openai') {
    return { isValid: true, message: 'No parameter validation needed' };
  }

  const tools = hasTools !== undefined
    ? hasTools
    : Boolean(parameters.tool_ids || parameters.assistant_end_call_enabled);

  // Value-level checks that need no model family. A `scale` tier, or a forced tool choice with
  // an empty tool list, is refused on every model OpenAI serves — reject at save time instead.
  if (parameters.service_tier !== undefined && parameters.service_tier !== null) {
    const tier = String(parameters.service_tier).toLowerCase();
    if (!SERVICE_TIERS.includes(tier)) {
      return {
        isValid: false,
        message: `assistant_llm_config.service_tier '${parameters.service_tier}' is not an OpenAI ` +
                 `tier — expected one of: ${SERVICE_TIERS.join(', ')}. 'scale' was removed from ` +
                 'the API and can never have worked.'
      };
    }
  }

  if (parameters.tool_choice !== undefined && parameters.tool_choice !== null) {
    const choice = String(parameters.tool_choice).toLowerCase();
    if (!TOOL_CHOICES.includes(choice)) {
      return {
        isValid: false,
        message: `assistant_llm_config.tool_choice must be one of: ${TOOL_CHOICES.join(', ')}`
      };
    }
    if (choice === 'required' && !tools) {
      return {
        isValid: false,
        message: "assistant_llm_config.tool_choice 'required' needs at least one tool — " +
                 "attach a tool or set assistant_end_call_enabled: true, or use 'auto'"
      };
    }
  }

  if (!model) {
    return { isValid: true, message: 'No model-level validation needed' };
  }

  // Validate model is allowed for the mode
  let allowedModels;
  if (mode === 'cascade') {
    allowedModels = OPENAI_CASCADE_MODELS;
  } else {
    allowedModels = OPENAI_REALTIME_MODELS;
  }
  
  if (!allowedModels.includes(model)) {
    const hint = mode === 'cascade' 
      ? 'realtime model IDs belong to pipeline/realtime mode'
      : 'plain chat model IDs belong to cascade mode';
    return {
      isValid: false,
      message: `Model '${model}' is not valid in ${mode} mode (${hint}). ` +
               `Expected one of: ${allowedModels.join(', ')}`
    };
  }

  // `flex` is gpt-5 generation only — on a chat model OpenAI refuses it on every turn, and on
  // some models does not even name the parameter, which is how an assistant ends up in silence.
  if (parameters.service_tier !== undefined && parameters.service_tier !== null) {
    const tier = String(parameters.service_tier).toLowerCase();
    if (tier === 'flex' && !GPT5_GENERATION.includes(model)) {
      return {
        isValid: false,
        message: `assistant_llm_config.service_tier 'flex' is not supported by model '${model}' — ` +
                 `flex is a gpt-5 generation tier. Use 'auto', 'default', 'fast' or 'priority' ` +
                 'instead, or leave it unset.'
      };
    }
  }

  // Check each model-gated knob against the family table. A knob the model does not read is
  // not ignored by OpenAI: it answers 400 on every LLM turn, so the call connects and the
  // assistant never speaks. Rejecting here means the operator finds out at save time.
  for (const knob of ['temperature', 'reasoning_effort', 'verbosity']) {
    if (parameters[knob] === undefined || parameters[knob] === null) {
      continue;
    }
    const reason = unsupportedKnobReason(model, knob, tools);
    if (reason) {
      return {
        isValid: false,
        message: `assistant_llm_config.${knob} is not supported by model '${model}' — ${reason}.`
      };
    }
  }

  return { isValid: true, message: 'Valid model parameters' };
};

/**
 * Validates language codes for a given provider
 * @param {string} provider - The provider
 * @param {string|string[]} languageCodes - Language code(s) to validate
 * @returns {object} Validation result with isValid flag and message
 */
const validateLanguageCodes = (provider, languageCodes) => {
  if (!languageCodes || !provider) {
    return { isValid: true, message: 'No language codes to validate' };
  }
  
  const codes = Array.isArray(languageCodes) ? languageCodes : [languageCodes];
  const standardInfo = LANGUAGE_STANDARDS[provider];
  
  if (!standardInfo) {
    return { isValid: true, message: 'No language code validation for this provider' };
  }
  
  // Check if using the wrong language code standard
  const standard = standardInfo.standard;
  const example = standardInfo.example;
  
  // For providers with specific valid codes
  const validCodes = VALID_LANGUAGE_CODES[provider];
  if (validCodes) {
    const invalidCodes = codes.filter(code => !validCodes.includes(code));
    if (invalidCodes.length > 0) {
      return {
        isValid: false,
        message: `Invalid language code(s) for ${provider}: ${invalidCodes.join(', ')}. ` +
                 `Valid codes: ${validCodes.join(', ')}. ` +
                 `${provider} uses ${standard} codes (e.g., ${example}).`
      };
    }
  }
  
  // Special validation for ElevenLabs which is strict about code format
  if (provider === 'elevenlabs') {
    // ElevenLabs uses ISO 639-3 codes and is very strict
    // BCP-47 codes like 'en-US' will cause connection failures
    const bcp47Codes = codes.filter(code => code.includes('-'));
    if (bcp47Codes.length > 0) {
      return {
        isValid: false,
        message: `Invalid language code(s) for ${provider}: ${bcp47Codes.join(', ')}. ` +
                 `ElevenLabs requires ISO 639-3 codes (e.g., 'eng', 'hin') not BCP-47 codes. ` +
                 `Using BCP-47 codes will cause connection failures with error '1008 invalid_request'.`
      };
    }
  }
  
  // Special validation for Cartesia which has no auto-detect
  if (provider === 'cartesia' && codes.includes('multi')) {
    return {
      isValid: false,
      message: `Invalid language code 'multi' for ${provider}. ` +
               `Cartesia has no auto-detection capability. ` +
               `You must specify a fixed language code from: ${VALID_LANGUAGE_CODES.cartesia.join(', ')}`
    };
  }
  
  return { isValid: true, message: 'Valid language codes' };
};

/**
 * Gets detailed compatibility information for a mode
 * @param {string} mode - The assistant mode
 * @returns {object} Detailed compatibility information
 */
const getCompatibilityInfo = (mode) => {
  return COMPATIBILITY_MATRIX[mode] || null;
};

/**
 * Gets suggested alternatives for invalid configurations
 * @param {string} mode - The assistant mode
 * @param {string} llmProvider - The LLM provider
 * @param {string} sttProvider - The STT provider
 * @param {string} ttsProvider - The TTS provider
 * @returns {object} Suggestions for valid configurations
 */
const getSuggestedAlternatives = (mode, llmProvider, sttProvider, ttsProvider) => {
  const suggestions = {};
  
  const modeRules = PROVIDER_COMPATIBILITY[mode];
  
  if (modeRules) {
    if (llmProvider && modeRules.llm && !modeRules.llm.includes(llmProvider)) {
      suggestions.llm = `Try: ${modeRules.llm.join(', ')}`;
    }
    
    if (sttProvider && modeRules.stt && !modeRules.stt.includes(sttProvider)) {
      suggestions.stt = `Try: ${modeRules.stt.join(', ')}`;
    }
    
    if (ttsProvider && modeRules.tts && !modeRules.tts.includes(ttsProvider)) {
      suggestions.tts = `Try: ${modeRules.tts.join(', ')}`;
    }
  }
  
  // Add detailed notes if available
  const compatibilityInfo = COMPATIBILITY_MATRIX[mode];
  if (compatibilityInfo) {
    if (llmProvider && compatibilityInfo.llm?.notes) {
      suggestions.llm_notes = compatibilityInfo.llm.notes;
    }
    if (sttProvider && compatibilityInfo.stt?.notes) {
      suggestions.stt_notes = compatibilityInfo.stt.notes;
    }
    if (ttsProvider && compatibilityInfo.tts?.notes) {
      suggestions.tts_notes = compatibilityInfo.tts.notes;
    }
  }
  
  return suggestions;
};

/**
 * Comprehensive validation of assistant configuration
 * @param {object} config - The assistant configuration
 * @returns {object} Validation result with isValid flag, message, and suggestions
 */
const validateAssistantConfiguration = (config) => {
  const {
    assistant_mode,
    assistant_stt_model,
    assistant_tts_model,
  } = config;

  // `?? {}`, not a destructuring default: a client clearing a config sends an explicit `null`
  // (realtime drops the speech pipeline that way), and a default only fires for `undefined`.
  // Reading `.language` off that null was a 500 where the answer is "nothing to validate".
  const assistant_llm_config = config.assistant_llm_config ?? {};
  const assistant_stt_config = config.assistant_stt_config ?? {};
  const assistant_tts_config = config.assistant_tts_config ?? {};

  const mode = assistant_mode || 'pipeline';
  const llmProvider = assistant_llm_config.provider || (mode === 'realtime' ? 'gemini' : 'openai');
  const sttProvider = assistant_stt_model;
  const ttsProvider = assistant_tts_model;
  
  // Validate provider combination
  const providerValidation = validateProviderCombination(mode, llmProvider, sttProvider, ttsProvider);
  if (!providerValidation.isValid) {
    return {
      isValid: false,
      message: providerValidation.message,
      suggestions: getSuggestedAlternatives(mode, llmProvider, sttProvider, ttsProvider)
    };
  }

  // An assistant "has tools" when it has tool_ids or the built-in end-call tool. tool_ids are
  // attached separately from the assistant payload, so in this flow the end-call flag is the
  // only in-payload signal.
  const hasTools = Boolean(config.assistant_end_call_enabled || assistant_llm_config.tool_ids);

  // Validate model parameters
  const modelValidation = validateModelParameters(
    mode, 
    llmProvider, 
    assistant_llm_config.model, 
    assistant_llm_config,
    hasTools
  );
  if (!modelValidation.isValid) {
    return {
      isValid: false,
      message: modelValidation.message
    };
  }
  
  // Validate language codes for STT
  if (assistant_stt_config.language || assistant_stt_config.language_code) {
    const sttLanguageValidation = validateLanguageCodes(
      sttProvider, 
      assistant_stt_config.language || assistant_stt_config.language_code
    );
    if (!sttLanguageValidation.isValid) {
      return {
        isValid: false,
        message: sttLanguageValidation.message
      };
    }
  }
  
  // Validate language codes for TTS
  if (assistant_tts_config.target_language_code) {
    const ttsLanguageValidation = validateLanguageCodes(
      ttsProvider, 
      assistant_tts_config.target_language_code
    );
    if (!ttsLanguageValidation.isValid) {
      return {
        isValid: false,
        message: ttsLanguageValidation.message
      };
    }
  }
  
  return { isValid: true, message: 'Configuration is valid' };
};

module.exports = {
  validateProviderCombination,
  validateModelParameters,
  validateLanguageCodes,
  getSuggestedAlternatives,
  getCompatibilityInfo,
  validateAssistantConfiguration,
  PROVIDER_COMPATIBILITY,
  COMPATIBILITY_MATRIX,
  REASONING_MODELS,
  CHAT_MODELS,
  GPT5_GENERATION,
  REASONING_TOOL_INCOMPATIBLE,
  unsupportedKnobReason,
  LANGUAGE_STANDARDS,
  VALID_LANGUAGE_CODES
};