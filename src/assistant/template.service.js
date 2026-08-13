/**
 * Template service for assistant configurations
 * Provides predefined templates for common use cases
 */
const fs = require('fs');
const path = require('path');

// Load all templates from the templates directory
const loadTemplates = () => {
  const templatesDir = path.join(__dirname, 'templates');
  const templates = {};
  
  try {
    const files = fs.readdirSync(templatesDir);
    
    files.forEach(file => {
      if (file.endsWith('.js')) {
        const templateName = path.basename(file, '.js');
        const template = require(`./templates/${templateName}`);
        templates[templateName] = {
          id: templateName,
          name: template.name,
          description: template.description,
          configuration: {
            assistant_mode: template.mode,
            assistant_llm_config: template.llm_config,
            assistant_tts_model: template.tts_model,
            assistant_tts_config: template.tts_config,
            assistant_stt_model: template.stt_model,
            assistant_stt_config: template.stt_config,
            assistant_interaction_config: template.interaction_config,
            assistant_end_call_enabled: template.end_call_enabled,
            assistant_end_call_trigger_phrase: template.end_call_trigger_phrase,
            assistant_end_call_agent_message: template.end_call_agent_message
          }
        };
      }
    });
  } catch (error) {
    console.error('Error loading templates:', error);
  }
  
  return templates;
};

// Load templates at startup
const TEMPLATES = loadTemplates();

/**
 * Get all available templates
 * @returns {object} Object containing all templates
 */
const getAllTemplates = () => {
  return TEMPLATES;
};

/**
 * Get a specific template by ID
 * @param {string} templateId - The template ID
 * @returns {object|null} The template or null if not found
 */
const getTemplateById = (templateId) => {
  return TEMPLATES[templateId] || null;
};

/**
 * Get template configuration by ID
 * @param {string} templateId - The template ID
 * @returns {object|null} The template configuration or null if not found
 */
const getTemplateConfiguration = (templateId) => {
  const template = TEMPLATES[templateId];
  return template ? template.configuration : null;
};

/**
 * List all available template IDs
 * @returns {string[]} Array of template IDs
 */
const listTemplateIds = () => {
  return Object.keys(TEMPLATES);
};

/**
 * Get template metadata (name and description only)
 * @param {string} templateId - The template ID
 * @returns {object|null} Template metadata or null if not found
 */
const getTemplateMetadata = (templateId) => {
  const template = TEMPLATES[templateId];
  if (!template) return null;
  
  return {
    id: template.id,
    name: template.name,
    description: template.description
  };
};

/**
 * Get metadata for all templates
 * @returns {object[]} Array of template metadata
 */
const getAllTemplateMetadata = () => {
  return Object.values(TEMPLATES).map(template => ({
    id: template.id,
    name: template.name,
    description: template.description
  }));
};

module.exports = {
  getAllTemplates,
  getTemplateById,
  getTemplateConfiguration,
  listTemplateIds,
  getTemplateMetadata,
  getAllTemplateMetadata
};