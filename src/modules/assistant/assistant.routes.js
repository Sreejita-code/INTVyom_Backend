const express = require('express');
const router = express.Router();
const assistantController = require('./assistant.controller');

router.post('/create', assistantController.create);
router.get('/list', assistantController.list);
module.exports = router;