/**
 * Guided configuration wizard service
 * Provides step-by-step guidance for assistant configuration
 */
const { 
  PROVIDER_COMPATIBILITY, 
  COMPATIBILITY_MATRIX,
  LANGUAGE_STANDARDS,
  VALID_LANGUAGE_CODES
} = require('./assistant.validation');

// Configuration steps for the wizard
const CONFIGURATION_STEPS = [
  {
    id: 'mode',
    title: 'Select Assistant Mode',
    description: 'Choose the runtime mode for your assistant',
    fields: ['assistant_mode']
  },
  {
    id: 'llm',
    title: 'Configure Language Model',
    description: 'Select and configure your language model provider',
    fields: ['assistant_llm_config']
  },
  {
    id: 'tts',
    title: 'Configure Text-to-Speech',
    description: 'Select and configure your text-to-speech provider',
    fields: ['assistant_tts_model', 'assistant_tts_config'],
    condition: (config) => config.assistant_mode !== 'realtime'
  },
  {
    id: 'stt',
    title: 'Configure Speech-to-Text',
    description: 'Select and configure your speech-to-text provider',
    fields: ['assistant_stt_model', 'assistant_stt_config'],
    condition: (config) => config.assistant_mode !== 'realtime'
  },
  {
    id: 'interaction',
    title: 'Configure Interaction Settings',
    description: 'Customize how your assistant interacts with users',
    fields: ['assistant_interaction_config']
  },
  {
    id: 'advanced',
    title: 'Advanced Settings',
    description: 'Configure advanced features like end-call functionality',
    fields: [
      'assistant_end_call_enabled',
      'assistant_end_call_trigger_phrase',
      'assistant_end_call_agent_message',
      'assistant_end_call_url'
    ]
  }
];

/**
 * Get configuration steps for the wizard
 * @param {object} currentConfig - Current configuration (optional)
 * @returns {array} Array of configuration steps
 */
const getConfigurationSteps = (currentConfig = {}) => {
  return CONFIGURATION_STEPS.filter(step => {
    if (step.condition) {
      return step.condition(currentConfig);
    }
    return true;
  });
};

/**
 * Get the next step in the configuration wizard
 * @param {string} currentStepId - Current step ID
 * @param {object} currentConfig - Current configuration
 * @returns {object|null} Next step or null if at the end
 */
const getNextStep = (currentStepId, currentConfig = {}) => {
  const steps = getConfigurationSteps(currentConfig);
  const currentIndex = steps.findIndex(step => step.id === currentStepId);
  
  if (currentIndex === -1 || currentIndex === steps.length - 1) {
    return null;
  }
  
  return steps[currentIndex + 1];
};

/**
 * Get the previous step in the configuration wizard
 * @param {string} currentStepId - Current step ID
 * @param {object} currentConfig - Current configuration
 * @returns {object|null} Previous step or null if at the beginning
 */
const getPreviousStep = (currentStepId, currentConfig = {}) => {
  const steps = getConfigurationSteps(currentConfig);
  const currentIndex = steps.findIndex(step => step.id === currentStepId);
  
  if (currentIndex === -1 || currentIndex === 0) {
    return null;
  }
  
  return steps[currentIndex - 1];
};

/**
 * Get step details including validation rules and suggestions
 * @param {string} stepId - Step ID
 * @param {object} currentConfig - Current configuration
 * @returns {object} Step details with validation rules
 */
const getStepDetails = (stepId, currentConfig = {}) => {
  const step = CONFIGURATION_STEPS.find(s => s.id === stepId);
  
  if (!step) {
    return null;
  }
  
  const details = {
    ...step,
    validation_rules: {},
    suggestions: {}
  };
  
  // Add mode-specific validation rules
  if (stepId === 'mode') {
    details.validation_rules.assistant_mode = {
      required: true,
      allowed_values: ['pipeline', 'realtime', 'cascade'],
      default: 'pipeline'
    };
  }
  
  // Add LLM-specific validation rules
  if (stepId === 'llm') {
    const mode = currentConfig.assistant_mode || 'pipeline';
    const modeRules = PROVIDER_COMPATIBILITY[mode];
    
    if (modeRules && modeRules.llm) {
      details.validation_rules['assistant_llm_config.provider'] = {
        required: true,
        allowed_values: modeRules.llm
      };
      
      details.suggestions.providers = modeRules.llm.map(provider => ({
        value: provider,
        label: provider.charAt(0).toUpperCase() + provider.slice(1),
        description: getProviderDescription(provider, 'llm', mode)
      }));
    }
  }
  
  // Add TTS-specific validation rules
  if (stepId === 'tts') {
    const mode = currentConfig.assistant_mode || 'pipeline';
    const modeRules = PROVIDER_COMPATIBILITY[mode];
    
    if (modeRules && modeRules.tts) {
      details.validation_rules.assistant_tts_model = {
        required: true,
        allowed_values: modeRules.tts
      };
      
      details.suggestions.providers = modeRules.tts.map(provider => ({
        value: provider,
        label: provider.charAt(0).toUpperCase() + provider.slice(1),
        description: getProviderDescription(provider, 'tts', mode)
      }));
    }
  }
  
  // Add STT-specific validation rules
  if (stepId === 'stt') {
    const mode = currentConfig.assistant_mode || 'pipeline';
    const modeRules = PROVIDER_COMPATIBILITY[mode];
    
    if (modeRules && modeRules.stt) {
      details.validation_rules.assistant_stt_model = {
        required: true,
        allowed_values: modeRules.stt
      };
      
      details.suggestions.providers = modeRules.stt.map(provider => ({
        value: provider,
        label: provider.charAt(0).toUpperCase() + provider.slice(1),
        description: getProviderDescription(provider, 'stt', mode)
      }));
    }
  }
  
  return details;
};

/**
 * Get provider description for a specific mode
 * @param {string} provider - Provider name
 * @param {string} type - Provider type (llm, tts, stt)
 * @param {string} mode - Assistant mode
 * @returns {string} Provider description
 */
const getProviderDescription = (provider, type, mode) => {
  const compatibilityInfo = COMPATIBILITY_MATRIX[mode];
  
  if (compatibilityInfo && compatibilityInfo[type] && compatibilityInfo[type].restrictions) {
    const restrictions = compatibilityInfo[type].restrictions[provider];
    if (restrictions && restrictions.notes) {
      return restrictions.notes;
    }
  }
  
  // Default descriptions
  const descriptions = {
    llm: {
      openai: 'OpenAI models for text generation and conversation',
      gemini: 'Google Gemini models for advanced AI capabilities'
    },
    tts: {
      cartesia: 'High-quality text-to-speech with multiple voices',
      sarvam: 'Indian language text-to-speech provider',
      elevenlabs: 'Premium text-to-speech with natural sounding voices',
      mistral: 'Text-to-speech from Mistral AI'
    },
    stt: {
      sarvam: 'Indian language speech-to-text with code-switching support',
      cartesia: 'Accurate speech-to-text for multiple languages',
      deepgram: 'Enterprise-grade speech-to-text with diarization',
      elevenlabs: 'Speech-to-text from ElevenLabs',
      openai: 'OpenAI whisper models for speech transcription',
      native: 'Built-in transcription from the language model'
    }
  };
  
  return descriptions[type]?.[provider] || `Configure ${provider} ${type.toUpperCase()} settings`;
};

/**
 * Validate step configuration
 * @param {string} stepId - Step ID
 * @param {object} stepData - Data for this step
 * @param {object} currentConfig - Current overall configuration
 * @returns {object} Validation result
 */
const validateStep = (stepId, stepData, currentConfig = {}) => {
  const step = CONFIGURATION_STEPS.find(s => s.id === stepId);
  
  if (!step) {
    return {
      isValid: false,
      errors: [`Unknown step: ${stepId}`]
    };
  }
  
  const errors = [];
  
  // Validate required fields
  if (stepId === 'mode') {
    if (!stepData.assistant_mode) {
      errors.push('Assistant mode is required');
    } else if (!['pipeline', 'realtime', 'cascade'].includes(stepData.assistant_mode)) {
      errors.push('Assistant mode must be one of: pipeline, realtime, cascade');
    }
  }
  
  if (stepId === 'llm') {
    if (!stepData.assistant_llm_config) {
      errors.push('LLM configuration is required');
    } else {
      const mode = currentConfig.assistant_mode || stepData.assistant_mode || 'pipeline';
      const provider = stepData.assistant_llm_config.provider;
      
      if (provider) {
        const modeRules = PROVIDER_COMPATIBILITY[mode];
        if (modeRules && modeRules.llm && !modeRules.llm.includes(provider)) {
          errors.push(`LLM provider '${provider}' is not supported in ${mode} mode`);
        }
      }
    }
  }
  
  if (stepId === 'tts' && currentConfig.assistant_mode !== 'realtime') {
    if (!stepData.assistant_tts_model) {
      errors.push('TTS model is required');
    } else {
      const mode = currentConfig.assistant_mode || stepData.assistant_mode || 'pipeline';
      const modeRules = PROVIDER_COMPATIBILITY[mode];
      if (modeRules && modeRules.tts && !modeRules.tts.includes(stepData.assistant_tts_model)) {
        errors.push(`TTS provider '${stepData.assistant_tts_model}' is not supported in ${mode} mode`);
      }
    }
  }
  
  if (stepId === 'stt' && currentConfig.assistant_mode !== 'realtime') {
    if (!stepData.assistant_stt_model) {
      errors.push('STT model is required');
    } else {
      const mode = currentConfig.assistant_mode || stepData.assistant_mode || 'pipeline';
      const modeRules = PROVIDER_COMPATIBILITY[mode];
      if (modeRules && modeRules.stt && !modeRules.stt.includes(stepData.assistant_stt_model)) {
        errors.push(`STT provider '${stepData.assistant_stt_model}' is not supported in ${mode} mode`);
      }
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Get completion status for all steps
 * @param {object} currentConfig - Current configuration
 * @returns {object} Completion status for each step
 */
const getCompletionStatus = (currentConfig = {}) => {
  const steps = getConfigurationSteps(currentConfig);
  const status = {};
  
  steps.forEach(step => {
    // Simple completion check based on required fields
    let completed = true;
    
    if (step.id === 'mode') {
      completed = !!currentConfig.assistant_mode;
    } else if (step.id === 'llm') {
      completed = !!currentConfig.assistant_llm_config;
    } else if (step.id === 'tts' && currentConfig.assistant_mode !== 'realtime') {
      completed = !!currentConfig.assistant_tts_model;
    } else if (step.id === 'stt' && currentConfig.assistant_mode !== 'realtime') {
      completed = !!currentConfig.assistant_stt_model;
    } else if (step.id === 'interaction') {
      completed = !!currentConfig.assistant_interaction_config;
    }
    
    status[step.id] = completed;
  });
  
  return status;
};

module.exports = {
  getConfigurationSteps,
  getNextStep,
  getPreviousStep,
  getStepDetails,
  validateStep,
  getCompletionStatus
};