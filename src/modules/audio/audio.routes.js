const express = require('express');
const router = express.Router();
const multer = require('multer');
const audioController = require('./audio.controller');

const upload = multer({ storage: multer.memoryStorage() });

router.post('/upload', upload.single('file'), audioController.upload);
router.get('/list', audioController.list);
router.get('/:audio_id', audioController.details);
router.delete('/:audio_id', audioController.remove);

module.exports = router;
