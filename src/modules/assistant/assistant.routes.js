const express = require('express');
const router = express.Router();
const assistantController = require('./assistant.controller');

// Existing Routes
router.post('/create', assistantController.create);
router.get('/list', assistantController.list);
router.get('/details/:id', assistantController.details);

// --- New Update Route ---
// Matches: PATCH /api/assistant/update/550e8400...
router.patch('/update/:id', assistantController.update);

router.delete('/delete/:id', assistantController.deleteAssistant);
router.get('/call-logs/:id', assistantController.getCallLogs);

module.exports = router;