const express = require('express');
const multer = require('multer');
const asyncHandler = require('../../core/middleware/asyncHandler');
const sttService = require('../../stt/stt.service');
const { httpError } = require('./common');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const ALLOWED_PROVIDERS = new Set(['sarvam', 'cartesia', 'deepgram', 'openai', 'elevenlabs']);
const ALLOWED_EXT = new Set(['.wav', '.mp3', '.ogg', '.webm', '.m4a']);

const parseUpload = (req, res) =>
  new Promise((resolve, reject) => {
    upload.single('file')(req, res, (err) => {
      if (!err) return resolve();
      if (err.code === 'LIMIT_FILE_SIZE') {
        return reject(httpError(413, 'Audio file exceeds the 25 MB limit'));
      }
      return reject(httpError(400, err.message || 'Invalid multipart upload'));
    });
  });

router.post('/transcribe', asyncHandler(async (req, res) => {
  await parseUpload(req, res);

  if (!req.file) throw httpError(400, 'file is required');

  const { assistant_id, provider, model, language } = req.body || {};
  if (provider !== undefined && provider !== '' && !ALLOWED_PROVIDERS.has(String(provider))) {
    throw httpError(422, `provider must be one of: ${Array.from(ALLOWED_PROVIDERS).join(', ')}`);
  }
  // Light local hint only; upstream is authoritative for format decoding.
  const name = String(req.file.originalname || '').toLowerCase();
  const dot = name.lastIndexOf('.');
  if (dot >= 0 && !ALLOWED_EXT.has(name.slice(dot))) {
    throw httpError(422, 'file must be one of: wav, mp3, ogg, webm, m4a');
  }

  const providerApiKey = req.get('x-provider-api-key');
  const result = await sttService.transcribe(req.user._id, {
    file: req.file,
    fields: {
      ...(assistant_id ? { assistant_id } : {}),
      ...(provider ? { provider } : {}),
      ...(model ? { model } : {}),
      ...(language ? { language } : {}),
    },
    providerApiKey: providerApiKey || undefined,
  });

  res.status(200).json(result);
}));

module.exports = router;
