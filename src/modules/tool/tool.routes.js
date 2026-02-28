const express = require('express');
const router = express.Router();
const toolController = require('./tool.controller');

router.post('/create', toolController.create);
router.get('/list', toolController.list);
router.get('/details/:id', toolController.details);
router.patch('/update/:id', toolController.update);
router.delete('/delete/:id', toolController.deleteTool);

router.post('/attach/:assistant_id', toolController.attach);
router.post('/detach/:assistant_id', toolController.detach);

module.exports = router;