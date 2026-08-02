const express = require('express');
const router = express.Router();
const multer = require('multer');
const asyncHandler = require('../../core/middleware/asyncHandler');
const audioService = require('../../audio/audio.service');
const { httpError, preserveStatus } = require('./common');

const upload = multer({ storage: multer.memoryStorage() });

// Failures historically surfaced as 400 across the audio endpoints.
router.post('/upload', upload.single('file'), asyncHandler(async (req, res) => {
  const { user_id, audio_name, transcript } = req.body || {};
  const file = req.file;

  if (!user_id) throw httpError(400, 'user_id is required');
  if (!file) throw httpError(400, 'file is required');
  if (!audio_name) throw httpError(400, 'audio_name is required');
  if (!transcript) throw httpError(400, 'transcript is required');

  const result = await audioService.uploadAudio(user_id, { file, audio_name, transcript }).catch(preserveStatus(400));
  res.status(200).json(result);
}));

router.get('/list', asyncHandler(async (req, res) => {
  const { user_id, page, limit } = req.query;
  if (!user_id) throw httpError(400, 'user_id is required');

  const result = await audioService.listAudio(user_id, { page, limit }).catch(preserveStatus(400));
  res.status(200).json(result);
}));

router.get('/:audio_id', asyncHandler(async (req, res) => {
  const { audio_id } = req.params;
  const { user_id } = req.query;
  if (!user_id) throw httpError(400, 'user_id is required');
  if (!audio_id) throw httpError(400, 'audio_id is required');

  const result = await audioService.getAudioDetails(user_id, audio_id).catch(preserveStatus(400));
  res.status(200).json(result);
}));

router.delete('/:audio_id', asyncHandler(async (req, res) => {
  const { audio_id } = req.params;
  const { user_id } = req.query;
  if (!user_id) throw httpError(400, 'user_id is required');
  if (!audio_id) throw httpError(400, 'audio_id is required');

  const result = await audioService.deleteAudio(user_id, audio_id).catch(preserveStatus(400));
  res.status(200).json(result);
}));

module.exports = router;
