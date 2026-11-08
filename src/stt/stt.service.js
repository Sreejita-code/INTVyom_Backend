const FormData = require('form-data');
const Assistant = require('../core/db/schemas/assistant.model');
const { callExternal } = require('../services/livekit/livekitService');
const getUserWithKey = require('../auth/userAccess');
const findByLocalOrExternalId = require('../core/db/functions/findByLocalOrExternalId');

const resolveAssistantId = async (userId, assistantId) => {
  if (assistantId === undefined || assistantId === null || assistantId === '') return undefined;
  const assistant = await findByLocalOrExternalId(Assistant, String(assistantId), userId, 'external_assistant_id');
  if (!assistant) {
    const error = new Error('Assistant not found for this user');
    error.status = 404;
    throw error;
  }
  return assistant.external_assistant_id;
};

const transcribe = async (userId, { file, fields = {}, providerApiKey }) => {
  const user = await getUserWithKey(userId);
  const assistantId = await resolveAssistantId(user._id, fields.assistant_id);

  const form = new FormData();
  form.append('file', file.buffer, { filename: file.originalname, contentType: file.mimetype });
  if (assistantId) form.append('assistant_id', assistantId);
  if (fields.provider) form.append('provider', fields.provider);
  if (fields.model) form.append('model', fields.model);
  if (fields.language) form.append('language', fields.language);

  return callExternal(user.api_key, {
    method: 'post',
    path: '/stt/transcribe',
    data: form,
    headers: { ...form.getHeaders(), ...(providerApiKey ? { 'X-Provider-API-Key': providerApiKey } : {}) },
    fallback: 'Failed to transcribe audio',
    networkFallback: 'Failed to contact external STT service',
  });
};

module.exports = { transcribe, resolveAssistantId };
