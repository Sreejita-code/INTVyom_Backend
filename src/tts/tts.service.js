const Assistant = require('../core/db/schemas/assistant.model');
const { callExternal, callExternalStream } = require('../services/livekit/livekitService');
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

const buildPayload = async (userId, body) => {
  const assistantId = await resolveAssistantId(userId, body.assistant_id);
  const payload = { text: body.text };
  if (assistantId) payload.assistant_id = assistantId;
  if (body.provider !== undefined) payload.provider = body.provider;
  if (body.model !== undefined) payload.model = body.model;
  if (body.voice !== undefined) payload.voice = body.voice;
  if (body.language !== undefined) payload.language = body.language;
  if (body.save_to_library !== undefined) payload.save_to_library = body.save_to_library;
  if (body.response_format !== undefined) payload.response_format = body.response_format;
  return payload;
};

const synthesize = async (userId, body, { providerApiKey } = {}) => {
  const user = await getUserWithKey(userId);
  const payload = await buildPayload(user._id, body);
  return callExternal(user.api_key, {
    method: 'post',
    path: '/tts/synthesize',
    data: payload,
    headers: providerApiKey ? { 'X-Provider-API-Key': providerApiKey } : {},
    fallback: 'Failed to synthesize speech',
    networkFallback: 'Failed to contact external TTS service',
  });
};

const synthesizeStream = async (userId, body, { providerApiKey } = {}) => {
  const user = await getUserWithKey(userId);
  const payload = await buildPayload(user._id, body);
  return callExternalStream(user.api_key, {
    method: 'post',
    path: '/tts/synthesize',
    data: payload,
    headers: providerApiKey ? { 'X-Provider-API-Key': providerApiKey } : {},
    networkFallback: 'Failed to contact external TTS service',
  });
};

module.exports = { synthesize, synthesizeStream };
