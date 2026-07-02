const FormData = require('form-data');
const { callExternal, getUserWithKey } = require('../shared/remote');

const uploadAudio = async (userId, { file, audio_name, transcript }) => {
  const user = await getUserWithKey(userId);

  const form = new FormData();
  form.append('file', file.buffer, {
    filename: file.originalname,
    contentType: file.mimetype
  });
  form.append('audio_name', audio_name);
  form.append('transcript', transcript);

  return callExternal(user.api_key, {
    method: 'post',
    path: '/audio/upload',
    data: form,
    headers: form.getHeaders(),
  });
};

const listAudio = async (userId, { page, limit }) => {
  const user = await getUserWithKey(userId);
  return callExternal(user.api_key, { path: '/audio/list', params: { page, limit } });
};

const getAudioDetails = async (userId, audioId) => {
  const user = await getUserWithKey(userId);
  return callExternal(user.api_key, { path: `/audio/${audioId}` });
};

const deleteAudio = async (userId, audioId) => {
  const user = await getUserWithKey(userId);
  return callExternal(user.api_key, { method: 'delete', path: `/audio/${audioId}` });
};

module.exports = { uploadAudio, listAudio, getAudioDetails, deleteAudio };
