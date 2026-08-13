/**
 * Enhanced validation service for assistant configurations.
 * Provides comprehensive validation for provider combinations, model parameters, 
 * and language codes with improved error messages and suggestions.
 */
const { 
  OPENAI_REALTIME_MODELS, 
  OPENAI_CASCADE_MODELS, 
  CASCADE_STT_MODELS, 
  PIPELINE_STT_MODELS 
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
  sarvam: ['as', 'bn', 'brx', 'doi', 'en', 'gu', 'hi', 'kn', 'kok', 'ks', 'mai', 'ml', 'mni', 'mr', 'ne', 'od', 'pa', 'sa', 'sat', 'sd', 'ta', 'te', 'ur', 'unknown'],
  cartesia: ['en', 'de', 'es', 'fr', 'ja', 'pt', 'zh', 'hi', 'ko', 'it', 'nl', 'pl', 'ru', 'sv', 'tr', 'tl', 'bg', 'ro', 'ar', 'cs', 'el', 'fi', 'hr', 'ms', 'sk', 'da', 'ta', 'uk', 'hu', 'no', 'vi', 'bn', 'th', 'he', 'ka', 'id', 'te', 'gu', 'kn', 'ml', 'mr', 'or', 'pa'],
  deepgram: null, // Deepgram accepts many BCP-47 codes
  elevenlabs: null, // ElevenLabs auto-detects ~190 languages
  openai: null // OpenAI accepts ISO 639-1 codes
};

// Model families for parameter validation
const REASONING_MODELS = [
  'gpt-5', 'gpt-5-mini', 'gpt-5-nano',
  'gpt-5.1', 'gpt-5.2', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano',
  'gpt-5.5', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'
];

const CHAT_MODELS = [
  'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano',
  'gpt-4o', 'gpt-4o-mini',
  'gpt-5.1-chat-latest', 'gpt-5.2-chat-latest', 'gpt-5.3-chat-latest',
  'chat-latest', 'gpt-oss-120b'
];

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
          models: 'Any Gemini Live model (not validated)',
          notes: 'Default model: gemini-3.1-flash-live-preview'
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
 * @returns {object} Validation result with isValid flag and message
 */
const validateModelParameters = (mode, provider, model, parameters = {}) => {
  if (provider !== 'openai' || !model) {
    return { isValid: true, message: 'No parameter validation needed' };
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
  
  // Validate parameters based on model family
  const isReasoningModel = REASONING_MODELS.some(rm => model.startsWith(rm));
  const isChatModel = CHAT_MODELS.some(cm => model.startsWith(cm));
  
  // Check for incompatible parameters
  if (isReasoningModel && parameters.temperature !== undefined) {
    return {
      isValid: false,
      message: `Reasoning model '${model}' does not accept 'temperature' parameter. ` +
               `Use 'reasoning_effort' instead. Reasoning models reject 'temperature' and take 'reasoning_effort'; ` +
               `chat models are the reverse.`
    };
  }
  
  if (isChatModel && parameters.reasoning_effort !== undefined) {
    return {
      isValid: false,
      message: `Chat model '${model}' does not accept 'reasoning_effort' parameter. ` +
               `Use 'temperature' instead. Reasoning models reject 'temperature' and take 'reasoning_effort'; ` +
               `chat models are the reverse.`
    };
  }
  
  // Special case for gpt-5.2 and gpt-5.4* models
  const specialModels = ['gpt-5.2', 'gpt-5.4'];
  const isSpecialModel = specialModels.some(sm => model.startsWith(sm));
  
  if (isSpecialModel && parameters.reasoning_effort !== undefined && 
      (parameters.tool_ids || parameters.assistant_end_call_enabled)) {
    return {
      isValid: false,
      message: `Model '${model}' rejects 'reasoning_effort' when tools are attached. ` +
               `This model refuses 'reasoning.effort' in any request carrying function tools.`
    };
  }
  
  // Validate verbosity parameter
  if (parameters.verbosity !== undefined) {
    // gpt-5 generation accepts verbosity, but gpt-4.1* and gpt-4o* do not
    const noVerbosityModels = ['gpt-4.1', 'gpt-4o'];
    const hasNoVerbosity = noVerbosityModels.some(nvm => model.startsWith(nvm));
    
    if (hasNoVerbosity) {
      return {
        isValid: false,
        message: `Model '${model}' does not accept 'verbosity' parameter. ` +
                 `Only gpt-5 generation models accept 'verbosity'.`
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
    assistant_llm_config = {}, 
    assistant_stt_model, 
    assistant_tts_model,
    assistant_stt_config = {},
    assistant_tts_config = {}
  } = config;
  
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
  
  // Validate model parameters
  const modelValidation = validateModelParameters(
    mode, 
    llmProvider, 
    assistant_llm_config.model, 
    assistant_llm_config
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
  LANGUAGE_STANDARDS,
  VALID_LANGUAGE_CODES
};