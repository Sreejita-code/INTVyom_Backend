const express = require('express');
const asyncHandler = require('../../core/middleware/asyncHandler');
const assistantService = require('../../assistant/assistant.service');
const { buildPlatformBillableWorkbook } = require('../../assistant/exporter');
const { httpError } = require('./common');

const router = express.Router();

// All errors thrown by assistantService carry their own status (validation 400,
// upstream rejections passthrough) — nothing to remap here.

router.post('/create', asyncHandler(async (req, res) => {
  // Identity comes from the bearer key, not the payload — a body user_id is overridden.
  const assistant = await assistantService.createAssistant({ ...(req.body || {}), user_id: req.user._id });

  res.status(201).json({
    message: 'Assistant created successfully',
    assistant
  });
}));

router.get('/list', asyncHandler(async (req, res) => {
  const { page, limit, assistant_name, start_date, end_date, sort_by, sort_order } = req.query;

  const queryParams = {};
  if (page) queryParams.page = parseInt(page, 10);

  // FIX: Set a safe maximum limit of 100 instead of 1000 to prevent API crashes.
  // This deliberately overrides upstream's default of 10 — existing clients rely on getting
  // the whole list back in one request, so the default is not lowered to match.
  queryParams.limit = limit ? parseInt(limit, 10) : 100;

  // Upstream filter/sort params, forwarded only when sent so its own defaults still apply.
  if (assistant_name) queryParams.assistant_name = assistant_name;
  if (start_date) queryParams.start_date = start_date;
  if (end_date) queryParams.end_date = end_date;
  if (sort_by) queryParams.sort_by = sort_by;
  if (sort_order) queryParams.sort_order = sort_order;

  const result = await assistantService.listAssistants(req.user._id, queryParams);
  res.status(200).json(result);
}));

router.get('/details/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) throw httpError(400, 'Assistant ID is required');

  const result = await assistantService.getAssistantDetails(req.user._id, id);
  res.status(200).json(result);
}));

router.patch('/update/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) throw httpError(400, 'Assistant ID is required');

  const result = await assistantService.updateAssistant(req.user._id, id, req.body || {});
  res.status(200).json(result);
}));

router.delete('/delete/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) throw httpError(400, 'Assistant ID is required');

  const result = await assistantService.deleteAssistant(req.user._id, id);
  res.status(200).json(result);
}));

router.get('/call-logs/:id', asyncHandler(async (req, res) => {
  const { id } = req.params; // The assistant ID
  // All possible LiveKit query parameters
  const {
    page,
    limit,
    start_date,
    end_date,
    sort_by,
    sort_order
  } = req.query;

  if (!id) throw httpError(400, 'assistant id is required');

  // Build queryParams object dynamically, only including defined parameters
  const queryParams = {};
  if (page) queryParams.page = page;
  if (limit) queryParams.limit = limit;
  if (start_date) queryParams.start_date = start_date;
  if (end_date) queryParams.end_date = end_date;
  if (sort_by) queryParams.sort_by = sort_by;
  if (sort_order) queryParams.sort_order = sort_order;

  const result = await assistantService.getCallLogs(req.user._id, id, queryParams);
  res.status(200).json(result);
}));

router.get('/billable-minutes/:id', asyncHandler(async (req, res) => {
  const { id } = req.params; // The assistant ID
  const {
    to_number,
    start_date,
    end_date
  } = req.query;

  if (!id) throw httpError(400, 'assistant id is required');
  if (!to_number) throw httpError(400, 'to_number query parameter is required');

  const queryParams = { to_number };
  if (start_date) queryParams.start_date = start_date;
  if (end_date) queryParams.end_date = end_date;

  const result = await assistantService.getTotalBillableDuration(req.user._id, id, queryParams);
  res.status(200).json(result);
}));

router.get('/platform-billable-minutes', asyncHandler(async (req, res) => {
  const { start_date, end_date } = req.query;

  const queryParams = {};
  if (start_date) queryParams.start_date = start_date;
  if (end_date) queryParams.end_date = end_date;

  const result = await assistantService.getPlatformWiseBillableMinutes(req.user._id, queryParams);
  res.status(200).json(result);
}));

router.get('/platform-billable-minutes/download', asyncHandler(async (req, res) => {
  const { start_date, end_date } = req.query;

  const queryParams = {};
  if (start_date) queryParams.start_date = start_date;
  if (end_date) queryParams.end_date = end_date;

  const result = await assistantService.getPlatformWiseBillableMinutes(req.user._id, queryParams);
  const workbook = buildPlatformBillableWorkbook(result);

  // Set response headers to trigger file download in the browser
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    'attachment; filename=' + `platform_billable_minutes.xlsx`
  );

  await workbook.xlsx.write(res);
  res.status(200).end();
}));

router.post('/validate', asyncHandler(async (req, res) => {
  const result = await assistantService.validateAssistant(req.user._id, req.body || {});
  res.status(200).json(result);
}));

router.get('/templates', asyncHandler(async (req, res) => {
  const templateService = require('../../assistant/template.service');
  const templates = templateService.getAllTemplateMetadata();
  
  res.status(200).json({
    success: true,
    message: 'Templates retrieved successfully',
    data: templates
  });
}));

router.get('/templates/:id', asyncHandler(async (req, res) => {
  const templateService = require('../../assistant/template.service');
  const { id } = req.params;
  
  const template = templateService.getTemplateById(id);
  
  if (!template) {
    throw httpError(404, `Template '${id}' not found`);
  }
  
  res.status(200).json({
    success: true,
    message: 'Template retrieved successfully',
    data: template
  });
}));

router.post('/templates/:id/apply', asyncHandler(async (req, res) => {
  const templateService = require('../../assistant/template.service');
  const { id } = req.params;
  const overrides = req.body || {};

  const templateConfig = templateService.getTemplateConfiguration(id);
  
  if (!templateConfig) {
    throw httpError(404, `Template '${id}' not found`);
  }
  
  // Apply overrides to template configuration
  const finalConfig = { ...templateConfig, ...overrides };
  
  // Remove template-specific fields that shouldn't be sent to create
  delete finalConfig.template_id;
  
  // Identity comes from the bearer key, not the payload.
  finalConfig.user_id = req.user._id;
  
  // Create the assistant with the template configuration
  const assistant = await assistantService.createAssistant(finalConfig);
  
  res.status(201).json({
    success: true,
    message: 'Assistant created from template successfully',
    data: assistant
  });
}));

// Wizard endpoints
router.get('/wizard/steps', asyncHandler(async (req, res) => {
  const wizardService = require('../../assistant/wizard.service');
  const { config } = req.query;
  
  let parsedConfig = {};
  if (config) {
    try {
      parsedConfig = JSON.parse(config);
    } catch (e) {
      // Ignore parsing errors
    }
  }
  
  const steps = wizardService.getConfigurationSteps(parsedConfig);
  
  res.status(200).json({
    success: true,
    message: 'Wizard steps retrieved successfully',
    data: steps
  });
}));

router.get('/wizard/steps/:id', asyncHandler(async (req, res) => {
  const wizardService = require('../../assistant/wizard.service');
  const { id } = req.params;
  const { config } = req.query;
  
  let parsedConfig = {};
  if (config) {
    try {
      parsedConfig = JSON.parse(config);
    } catch (e) {
      // Ignore parsing errors
    }
  }
  
  const stepDetails = wizardService.getStepDetails(id, parsedConfig);
  
  if (!stepDetails) {
    throw httpError(404, `Wizard step '${id}' not found`);
  }
  
  res.status(200).json({
    success: true,
    message: 'Wizard step details retrieved successfully',
    data: stepDetails
  });
}));

router.post('/wizard/steps/:id/validate', asyncHandler(async (req, res) => {
  const wizardService = require('../../assistant/wizard.service');
  const { id } = req.params;
  const { step_data, current_config } = req.body || {};
  
  const validation = wizardService.validateStep(id, step_data || {}, current_config || {});
  
  res.status(200).json({
    success: true,
    message: validation.isValid ? 'Step is valid' : 'Step validation failed',
    data: validation
  });
}));

router.get('/wizard/navigation', asyncHandler(async (req, res) => {
  const wizardService = require('../../assistant/wizard.service');
  const { current_step, config } = req.query;
  
  let parsedConfig = {};
  if (config) {
    try {
      parsedConfig = JSON.parse(config);
    } catch (e) {
      // Ignore parsing errors
    }
  }
  
  const navigation = {
    next: wizardService.getNextStep(current_step, parsedConfig),
    previous: wizardService.getPreviousStep(current_step, parsedConfig)
  };
  
  res.status(200).json({
    success: true,
    message: 'Navigation retrieved successfully',
    data: navigation
  });
}));

router.get('/wizard/status', asyncHandler(async (req, res) => {
  const wizardService = require('../../assistant/wizard.service');
  const { config } = req.query;
  
  let parsedConfig = {};
  if (config) {
    try {
      parsedConfig = JSON.parse(config);
    } catch (e) {
      // Ignore parsing errors
    }
  }
  
  const status = wizardService.getCompletionStatus(parsedConfig);
  
  res.status(200).json({
    success: true,
    message: 'Completion status retrieved successfully',
    data: status
  });
}));

module.exports = router;
