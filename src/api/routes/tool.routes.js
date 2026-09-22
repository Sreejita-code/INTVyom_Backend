const express = require('express');
const asyncHandler = require('../../core/middleware/asyncHandler');
const toolService = require('../../tool/tool.service');
const { httpError, preserveStatus } = require('./common');

const router = express.Router();

// Create tool — failures historically surfaced as 400.
router.post('/create', asyncHandler(async (req, res) => {
  // Identity comes from the bearer key; a body user_id must never reach the upstream payload.
  const toolData = { ...(req.body || {}) };
  delete toolData.user_id;
  if (!toolData.tool_name || !toolData.tool_execution_type) {
    throw httpError(400, 'tool_name and tool_execution_type are required');
  }

  const result = await toolService.createTool(req.user._id, toolData).catch(preserveStatus(400));
  res.status(201).json(result);
}));

// All remaining handlers — failures historically surfaced as 500.
router.get('/list', asyncHandler(async (req, res) => {
  const result = await toolService.listTools(req.user._id).catch(preserveStatus(500));
  res.status(200).json(result);
}));

router.get('/details/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!id) throw httpError(400, 'tool id is required');

  const result = await toolService.getToolDetails(req.user._id, id).catch(preserveStatus(500));
  res.status(200).json(result);
}));

router.patch('/update/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = { ...(req.body || {}) };
  delete updateData.user_id;
  if (!id) throw httpError(400, 'tool id is required');

  const result = await toolService.updateTool(req.user._id, id, updateData).catch(preserveStatus(500));
  res.status(200).json(result);
}));

router.delete('/delete/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!id) throw httpError(400, 'tool id is required');

  const result = await toolService.deleteTool(req.user._id, id).catch(preserveStatus(500));
  res.status(200).json(result);
}));

router.post('/attach/:assistant_id', asyncHandler(async (req, res) => {
  const { assistant_id } = req.params;
  const { tool_ids } = req.body || {};
  if (!tool_ids || !Array.isArray(tool_ids) || tool_ids.length === 0) {
    throw httpError(400, 'a non-empty tool_ids array is required');
  }

  const result = await toolService.attachTools(req.user._id, assistant_id, tool_ids).catch(preserveStatus(500));
  res.status(200).json(result);
}));

router.post('/detach/:assistant_id', asyncHandler(async (req, res) => {
  const { assistant_id } = req.params;
  const { tool_ids } = req.body || {};
  if (!tool_ids || !Array.isArray(tool_ids)) {
    throw httpError(400, 'tool_ids array is required');
  }

  const result = await toolService.detachTools(req.user._id, assistant_id, tool_ids).catch(preserveStatus(500));
  res.status(200).json(result);
}));

module.exports = router;
