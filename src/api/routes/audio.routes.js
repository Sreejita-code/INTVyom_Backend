const express = require('express');
const router = express.Router();
const multer = require('multer');
const asyncHandler = require('../../core/middleware/asyncHandler');
const audioService = require('../../audio/audio.service');
const { httpError, preserveStatus } = require('./common');

const upload = multer({ storage: multer.memoryStorage() });

// Failures historically surfaced as 400 across the audio endpoints.
router.post('/upload', upload.single('file'), asyncHandler(async (req, res) => {
  const { audio_name, transcript } = req.body || {};
  const file = req.file;

  if (!file) throw httpError(400, 'file is required');
  if (!audio_name) throw httpError(400, 'audio_name is required');
  if (!transcript) throw httpError(400, 'transcript is required');

  const result = await audioService.uploadAudio(req.user._id, { file, audio_name, transcript }).catch(preserveStatus(400));
  res.status(200).json(result);
}));

router.get('/list', asyncHandler(async (req, res) => {
  const { page, limit } = req.query;

  const result = await audioService.listAudio(req.user._id, { page, limit }).catch(preserveStatus(400));
  res.status(200).json(result);
}));

router.get('/:audio_id', asyncHandler(async (req, res) => {
  const { audio_id } = req.params;
  if (!audio_id) throw httpError(400, 'audio_id is required');

  const result = await audioService.getAudioDetails(req.user._id, audio_id).catch(preserveStatus(400));
  res.status(200).json(result);
}));

router.delete('/:audio_id', asyncHandler(async (req, res) => {
  const { audio_id } = req.params;
  if (!audio_id) throw httpError(400, 'audio_id is required');

  const result = await audioService.deleteAudio(req.user._id, audio_id).catch(preserveStatus(400));
  res.status(200).json(result);
}));

module.exports = router;
