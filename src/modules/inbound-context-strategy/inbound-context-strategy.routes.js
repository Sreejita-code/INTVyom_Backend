const express = require('express');
const router = express.Router();
const strategyController = require('./inbound-context-strategy.controller');

router.post('/create', strategyController.create);
router.get('/list', strategyController.list);
router.get('/details/:id', strategyController.details);
router.patch('/update/:id', strategyController.update);
router.delete('/delete/:id', strategyController.deleteStrategy);

module.exports = router;