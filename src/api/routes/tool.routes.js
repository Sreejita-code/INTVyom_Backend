const express = require('express');
const asyncHandler = require('../../core/middleware/asyncHandler');
const toolService = require('../../tool/tool.service');
const { httpError, preserveStatus } = require('./common');

const router = express.Router();

// Create tool — failures historically surfaced as 400.
router.post('/create', asyncHandler(async (req, res) => {
  const { user_id, ...toolData } = req.body || {};
  if (!user_id || !toolData.tool_name || !toolData.tool_execution_type) {
    throw httpError(400, 'user_id, tool_name, and tool_execution_type are required');
  }

  const result = await toolService.createTool(user_id, toolData).catch(preserveStatus(400));
  res.status(201).json(result);
}));

// All remaining handlers — failures historically surfaced as 500.
router.get('/list', asyncHandler(async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) throw httpError(400, 'user_id is required');

  const result = await toolService.listTools(user_id).catch(preserveStatus(500));
  res.status(200).json(result);
}));

router.get('/details/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { user_id } = req.query;
  if (!user_id || !id) throw httpError(400, 'user_id and tool id are required');

  const result = await toolService.getToolDetails(user_id, id).catch(preserveStatus(500));
  res.status(200).json(result);
}));

router.patch('/update/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { user_id, ...updateData } = req.body || {};
  if (!user_id || !id) throw httpError(400, 'user_id and tool id are required');

  const result = await toolService.updateTool(user_id, id, updateData).catch(preserveStatus(500));
  res.status(200).json(result);
}));

router.delete('/delete/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.query.user_id || req.body?.user_id;
  if (!userId || !id) throw httpError(400, 'user_id and tool id are required');

  const result = await toolService.deleteTool(userId, id).catch(preserveStatus(500));
  res.status(200).json(result);
}));

router.post('/attach/:assistant_id', asyncHandler(async (req, res) => {
  const { assistant_id } = req.params;
  const { user_id, tool_ids } = req.body || {};
  if (!user_id || !tool_ids || !Array.isArray(tool_ids) || tool_ids.length === 0) {
    throw httpError(400, 'user_id and a non-empty tool_ids array are required');
  }

  const result = await toolService.attachTools(user_id, assistant_id, tool_ids).catch(preserveStatus(500));
  res.status(200).json(result);
}));

router.post('/detach/:assistant_id', asyncHandler(async (req, res) => {
  const { assistant_id } = req.params;
  const { user_id, tool_ids } = req.body || {};
  if (!user_id || !tool_ids || !Array.isArray(tool_ids)) {
    throw httpError(400, 'user_id and tool_ids array are required');
  }

  const result = await toolService.detachTools(user_id, assistant_id, tool_ids).catch(preserveStatus(500));
  res.status(200).json(result);
}));

module.exports = router;
