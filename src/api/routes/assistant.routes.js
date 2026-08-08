const express = require('express');
const asyncHandler = require('../../core/middleware/asyncHandler');
const assistantService = require('../../assistant/assistant.service');
const { buildPlatformBillableWorkbook } = require('../../assistant/exporter');
const { httpError } = require('./common');

const router = express.Router();

// All errors thrown by assistantService carry their own status (validation 400,
// upstream rejections passthrough) — nothing to remap here.

router.post('/create', asyncHandler(async (req, res) => {
  const assistant = await assistantService.createAssistant(req.body || {});

  res.status(201).json({
    message: 'Assistant created successfully',
    assistant
  });
}));

router.get('/list', asyncHandler(async (req, res) => {
  const { user_id, page, limit, assistant_name, start_date, end_date, sort_by, sort_order } = req.query;

  if (!user_id) throw httpError(400, 'user_id query parameter is required');

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

  const result = await assistantService.listAssistants(user_id, queryParams);
  res.status(200).json(result);
}));

router.get('/details/:id', asyncHandler(async (req, res) => {
  const { user_id } = req.query;
  const { id } = req.params;

  if (!user_id) throw httpError(400, 'user_id query parameter is required');
  if (!id) throw httpError(400, 'Assistant ID is required');

  const result = await assistantService.getAssistantDetails(user_id, id);
  res.status(200).json(result);
}));

router.patch('/update/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { user_id, ...updateData } = req.body || {};

  if (!user_id) throw httpError(400, 'user_id is required in the request body');
  if (!id) throw httpError(400, 'Assistant ID is required');

  const result = await assistantService.updateAssistant(user_id, id, updateData);
  res.status(200).json(result);
}));

router.delete('/delete/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  // user_id can be sent in query string or body depending on frontend implementation
  const userId = req.query.user_id || req.body?.user_id;

  if (!userId) throw httpError(400, 'user_id is required');
  if (!id) throw httpError(400, 'Assistant ID is required');

  const result = await assistantService.deleteAssistant(userId, id);
  res.status(200).json(result);
}));

router.get('/call-logs/:id', asyncHandler(async (req, res) => {
  const { id } = req.params; // The assistant ID
  // Extract user_id and all possible LiveKit query parameters
  const {
    user_id,
    page,
    limit,
    start_date,
    end_date,
    sort_by,
    sort_order
  } = req.query;

  if (!user_id || !id) throw httpError(400, 'user_id and assistant id are required');

  // Build queryParams object dynamically, only including defined parameters
  const queryParams = {};
  if (page) queryParams.page = page;
  if (limit) queryParams.limit = limit;
  if (start_date) queryParams.start_date = start_date;
  if (end_date) queryParams.end_date = end_date;
  if (sort_by) queryParams.sort_by = sort_by;
  if (sort_order) queryParams.sort_order = sort_order;

  const result = await assistantService.getCallLogs(user_id, id, queryParams);
  res.status(200).json(result);
}));

router.get('/billable-minutes/:id', asyncHandler(async (req, res) => {
  const { id } = req.params; // The assistant ID
  const {
    user_id,
    to_number,
    start_date,
    end_date
  } = req.query;

  if (!user_id || !id) throw httpError(400, 'user_id and assistant id are required');
  if (!to_number) throw httpError(400, 'to_number query parameter is required');

  const queryParams = { to_number };
  if (start_date) queryParams.start_date = start_date;
  if (end_date) queryParams.end_date = end_date;

  const result = await assistantService.getTotalBillableDuration(user_id, id, queryParams);
  res.status(200).json(result);
}));

router.get('/platform-billable-minutes', asyncHandler(async (req, res) => {
  const { user_id, start_date, end_date } = req.query;

  if (!user_id) throw httpError(400, 'user_id query parameter is required');

  const queryParams = {};
  if (start_date) queryParams.start_date = start_date;
  if (end_date) queryParams.end_date = end_date;

  const result = await assistantService.getPlatformWiseBillableMinutes(user_id, queryParams);
  res.status(200).json(result);
}));

router.get('/platform-billable-minutes/download', asyncHandler(async (req, res) => {
  const { user_id, start_date, end_date } = req.query;

  if (!user_id) throw httpError(400, 'user_id query parameter is required');

  const queryParams = {};
  if (start_date) queryParams.start_date = start_date;
  if (end_date) queryParams.end_date = end_date;

  const result = await assistantService.getPlatformWiseBillableMinutes(user_id, queryParams);
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

module.exports = router;
