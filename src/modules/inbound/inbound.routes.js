const express = require('express');
const router = express.Router();
const inboundController = require('./inbound.controller');

router.post('/assign', inboundController.assign);
router.get('/list', inboundController.list);
router.patch('/update/:id', inboundController.update);
router.post('/detach/:id', inboundController.detach);
router.delete('/delete/:id', inboundController.deleteInbound);

module.exports = router;