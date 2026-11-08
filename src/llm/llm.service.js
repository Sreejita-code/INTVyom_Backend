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
  const payload = { messages: body.messages };
  if (assistantId) payload.assistant_id = assistantId;
  if (body.provider !== undefined) payload.provider = body.provider;
  if (body.model !== undefined) payload.model = body.model;
  if (body.temperature !== undefined) payload.temperature = body.temperature;
  if (body.max_tokens !== undefined) payload.max_tokens = body.max_tokens;
  if (body.stream !== undefined) payload.stream = body.stream;
  return payload;
};

const chat = async (userId, body, { providerApiKey } = {}) => {
  const user = await getUserWithKey(userId);
  const payload = await buildPayload(user._id, body);
  return callExternal(user.api_key, {
    method: 'post',
    path: '/llm/chat',
    data: payload,
    headers: providerApiKey ? { 'X-Provider-API-Key': providerApiKey } : {},
    fallback: 'Failed to complete chat request',
    networkFallback: 'Failed to contact external LLM service',
  });
};

const chatStream = async (userId, body, { providerApiKey } = {}) => {
  const user = await getUserWithKey(userId);
  const payload = await buildPayload(user._id, body);
  return callExternalStream(user.api_key, {
    method: 'post',
    path: '/llm/chat',
    data: payload,
    headers: providerApiKey ? { 'X-Provider-API-Key': providerApiKey } : {},
    networkFallback: 'Failed to contact external LLM service',
  });
};

module.exports = { chat, chatStream };
