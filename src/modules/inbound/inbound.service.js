const Inbound = require('./inbound.model');
const Assistant = require('../assistant/assistant.model');
const { callExternal, getUserWithKey, findByLocalOrExternalId } = require('../shared/remote');

// Helper to resolve Inbound ID
const resolveInboundId = async (userId, inboundId) => {
  const inbound = await findByLocalOrExternalId(Inbound, inboundId, userId, 'external_inbound_id');
  if (!inbound) throw new Error('Inbound mapping not found');
  return inbound;
};

// Helper to resolve Assistant ID
const resolveAssistantId = async (userId, assistantId) => {
  if (assistantId === null) return { _id: null, external_assistant_id: null };
  const assistant = await findByLocalOrExternalId(Assistant, assistantId, userId, 'external_assistant_id');
  if (!assistant) throw new Error('Assistant not found');
  return assistant;
};

// --- 1. Assign Inbound Number ---
const assignInbound = async (data) => {
  const { user_id, assistant_id, inbound_context_strategy_id, service, inbound_config } = data;

  const user = await getUserWithKey(user_id);

  const assistant = await resolveAssistantId(user._id, assistant_id);

  const externalPayload = {
    assistant_id: assistant.external_assistant_id,
    service,
    inbound_config
  };
  if (inbound_context_strategy_id) externalPayload.inbound_context_strategy_id = inbound_context_strategy_id;

  const externalResponseData = await callExternal(user.api_key, {
    method: 'post',
    path: '/inbound/assign',
    data: externalPayload,
    networkFallback: 'Failed to assign inbound number externally',
  });

  // Save to Local DB
  const extData = externalResponseData.data;
  const newInbound = new Inbound({
    user_id: user._id,
    external_inbound_id: extData.inbound_id,
    assistant_id: assistant._id,
    external_assistant_id: extData.assistant_id,
    inbound_context_strategy_id: extData.inbound_context_strategy_id || null,
    service: extData.service,
    phone_number: extData.phone_number,
    phone_number_normalized: extData.phone_number_normalized,
    inbound_config: extData.inbound_config
  });

  await newInbound.save();
  return externalResponseData;
};

// --- 2. List Inbound Numbers ---
const listInbound = async (userId) => {
  const user = await getUserWithKey(userId);
  return callExternal(user.api_key, { path: '/inbound/list', fallback: 'Failed to fetch inbound numbers' });
};

// --- 3. Update Mapping Fields ---
const updateInbound = async (userId, inboundId, updateData) => {
  const user = await getUserWithKey(userId);

  const inbound = await resolveInboundId(user._id, inboundId);

  const externalPayload = {};
  const localUpdate = {};

  // Handle Assistant Update/Detach
  if (updateData.assistant_id !== undefined) {
    if (updateData.assistant_id === null) {
      externalPayload.assistant_id = null;
      localUpdate.assistant_id = null;
      localUpdate.external_assistant_id = null;
    } else {
      const assistant = await resolveAssistantId(user._id, updateData.assistant_id);
      externalPayload.assistant_id = assistant.external_assistant_id;
      localUpdate.assistant_id = assistant._id;
      localUpdate.external_assistant_id = assistant.external_assistant_id;
    }
  }

  // Handle Strategy Update/Detach
  if (updateData.inbound_context_strategy_id !== undefined) {
    externalPayload.inbound_context_strategy_id = updateData.inbound_context_strategy_id;
    localUpdate.inbound_context_strategy_id = updateData.inbound_context_strategy_id;
  }

  const result = await callExternal(user.api_key, {
    method: 'patch',
    path: `/inbound/update/${inbound.external_inbound_id}`,
    data: externalPayload,
    fallback: 'Failed to update inbound mapping externally',
  });

  // Update Local DB
  if (Object.keys(localUpdate).length > 0) {
    await Inbound.findByIdAndUpdate(inbound._id, { $set: localUpdate });
  }

  return result;
};

// --- 4. Detach Inbound Number ---
const detachInbound = async (userId, inboundId) => {
  const user = await getUserWithKey(userId);

  const inbound = await resolveInboundId(user._id, inboundId);

  const result = await callExternal(user.api_key, {
    method: 'post',
    path: `/inbound/detach/${inbound.external_inbound_id}`,
    data: {},
    fallback: 'Failed to detach inbound mapping externally',
  });

  // Update Local DB (Set relations to null)
  await Inbound.findByIdAndUpdate(inbound._id, {
    $set: {
      assistant_id: null,
      external_assistant_id: null,
      inbound_context_strategy_id: null
    }
  });

  return result;
};

// --- 5. Delete Inbound Number ---
const deleteInbound = async (userId, inboundId) => {
  const user = await getUserWithKey(userId);

  const inbound = await resolveInboundId(user._id, inboundId);

  const result = await callExternal(user.api_key, {
    method: 'delete',
    path: `/inbound/delete/${inbound.external_inbound_id}`,
    fallback: 'Failed to delete inbound mapping externally',
  });

  // Delete locally
  await Inbound.findByIdAndDelete(inbound._id);
  return result;
};

module.exports = {
  assignInbound,
  listInbound,
  updateInbound,
  detachInbound,
  deleteInbound
};
