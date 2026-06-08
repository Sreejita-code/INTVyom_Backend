const audioService = require('./audio.service');

const upload = async (req, res) => {
  try {
    const { user_id, audio_name, transcript } = req.body;
    const file = req.file;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }
    if (!file) {
      return res.status(400).json({ error: 'file is required' });
    }
    if (!audio_name) {
      return res.status(400).json({ error: 'audio_name is required' });
    }
    if (!transcript) {
      return res.status(400).json({ error: 'transcript is required' });
    }

    const result = await audioService.uploadAudio(user_id, { file, audio_name, transcript });
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const list = async (req, res) => {
  try {
    const { user_id, page, limit } = req.query;
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });
    const result = await audioService.listAudio(user_id, { page, limit });
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const details = async (req, res) => {
  try {
    const { audio_id } = req.params;
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });
    if (!audio_id) return res.status(400).json({ error: 'audio_id is required' });
    const result = await audioService.getAudioDetails(user_id, audio_id);
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const remove = async (req, res) => {
  try {
    const { audio_id } = req.params;
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });
    if (!audio_id) return res.status(400).json({ error: 'audio_id is required' });
    const result = await audioService.deleteAudio(user_id, audio_id);
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

module.exports = { upload, list, details, remove };
