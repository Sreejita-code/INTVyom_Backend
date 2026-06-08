const axios = require('axios');
const https = require('https');
const FormData = require('form-data');
const User = require('../auth/user.model');

const getAgent = () => new https.Agent({ rejectUnauthorized: false });

const uploadAudio = async (userId, { file, audio_name, transcript }) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');
  if (!user.api_key) throw new Error('User does not have an API Key.');

  const form = new FormData();
  form.append('file', file.buffer, {
    filename: file.originalname,
    contentType: file.mimetype
  });
  form.append('audio_name', audio_name);
  form.append('transcript', transcript);

  try {
    const response = await axios.post(
      'https://api-livekit-vyom.indusnettechnologies.com/audio/upload',
      form,
      {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Bearer ${user.api_key}`
        },
        httpsAgent: getAgent()
      }
    );
    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(error.response.data.message || 'External API Error');
    }
    throw new Error('Failed to contact external service');
  }
};

const listAudio = async (userId, { page, limit }) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');
  if (!user.api_key) throw new Error('User does not have an API Key.');

  try {
    const response = await axios.get(
      'https://api-livekit-vyom.indusnettechnologies.com/audio/list',
      {
        params: { page, limit },
        headers: { 'Authorization': `Bearer ${user.api_key}` },
        httpsAgent: getAgent()
      }
    );
    return response.data;
  } catch (error) {
    if (error.response) throw new Error(error.response.data.message || 'External API Error');
    throw new Error('Failed to contact external service');
  }
};

const getAudioDetails = async (userId, audioId) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');
  if (!user.api_key) throw new Error('User does not have an API Key.');

  try {
    const response = await axios.get(
      `https://api-livekit-vyom.indusnettechnologies.com/audio/${audioId}`,
      {
        headers: { 'Authorization': `Bearer ${user.api_key}` },
        httpsAgent: getAgent()
      }
    );
    return response.data;
  } catch (error) {
    if (error.response) throw new Error(error.response.data.message || 'External API Error');
    throw new Error('Failed to contact external service');
  }
};

const deleteAudio = async (userId, audioId) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');
  if (!user.api_key) throw new Error('User does not have an API Key.');

  try {
    const response = await axios.delete(
      `https://api-livekit-vyom.indusnettechnologies.com/audio/${audioId}`,
      {
        headers: { 'Authorization': `Bearer ${user.api_key}` },
        httpsAgent: getAgent()
      }
    );
    return response.data;
  } catch (error) {
    if (error.response) throw new Error(error.response.data.message || 'External API Error');
    throw new Error('Failed to contact external service');
  }
};

module.exports = { uploadAudio, listAudio, getAudioDetails, deleteAudio };
