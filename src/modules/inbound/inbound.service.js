const axios = require('axios');
const https = require('https');
const Inbound = require('./inbound.model');
const User = require('../auth/user.model');
const Assistant = require('../assistant/assistant.model');

const getAgent = () => new https.Agent({ rejectUnauthorized: false });

// Helper to resolve Inbound ID
const resolveInboundId = async (userId, inboundId) => {
  const inbound = await Inbound.findOne({
    $or: [
      { _id: inboundId.match(/^[0-9a-fA-F]{24}$/) ? inboundId : null },
      { external_inbound_id: inboundId }
    ],
    user_id: userId
  });
  if (!inbound) throw new Error('Inbound mapping not found');
  return inbound;
};

// Helper to resolve Assistant ID
const resolveAssistantId = async (userId, assistantId) => {
  if (assistantId === null) return { _id: null, external_assistant_id: null };
  const assistant = await Assistant.findOne({
    $or: [
      { _id: assistantId.match(/^[0-9a-fA-F]{24}$/) ? assistantId : null },
      { external_assistant_id: assistantId }
    ],
    user_id: userId
  });
  if (!assistant) throw new Error('Assistant not found');
  return assistant;
};

// --- 1. Assign Inbound Number ---
const assignInbound = async (data) => {
  const { user_id, assistant_id, inbound_context_strategy_id, service, inbound_config } = data;

  const user = await User.findById(user_id);
  if (!user || !user.api_key) throw new Error('Valid User with API key required');

  const assistant = await resolveAssistantId(user._id, assistant_id);

  const externalPayload = {
    assistant_id: assistant.external_assistant_id,
    service,
    inbound_config
  };
  if (inbound_context_strategy_id) externalPayload.inbound_context_strategy_id = inbound_context_strategy_id;

  let externalResponseData = null;

  try {
    const response = await axios.post(
      'https://api-livekit-vyom.indusnettechnologies.com/inbound/assign',
      externalPayload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.api_key}`
        },
        httpsAgent: getAgent()
      }
    );
    externalResponseData = response.data;
  } catch (error) {
    if (error.response) throw new Error(error.response.data.message || 'External API Error');
    throw new Error('Failed to assign inbound number externally');
  }

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
  const user = await User.findById(userId);
  if (!user || !user.api_key) throw new Error('Valid User with API key required');

  try {
    const response = await axios.get(
      'https://api-livekit-vyom.indusnettechnologies.com/inbound/list',
      {
        headers: { 'Authorization': `Bearer ${user.api_key}` },
        httpsAgent: getAgent()
      }
    );
    return response.data;
  } catch (error) {
    if (error.response) throw new Error(error.response.data.message || 'Failed to fetch inbound numbers');
    throw new Error('Failed to contact external service');
  }
};

// --- 3. Update Mapping Fields ---
const updateInbound = async (userId, inboundId, updateData) => {
  const user = await User.findById(userId);
  if (!user || !user.api_key) throw new Error('Valid User with API key required');

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

  try {
    const response = await axios.patch(
      `https://api-livekit-vyom.indusnettechnologies.com/inbound/update/${inbound.external_inbound_id}`,
      externalPayload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.api_key}`
        },
        httpsAgent: getAgent()
      }
    );

    // Update Local DB
    if (Object.keys(localUpdate).length > 0) {
      await Inbound.findByIdAndUpdate(inbound._id, { $set: localUpdate });
    }

    return response.data;
  } catch (error) {
    if (error.response) throw new Error(error.response.data.message || 'Failed to update inbound mapping externally');
    throw new Error('Failed to contact external service');
  }
};

// --- 4. Detach Inbound Number ---
const detachInbound = async (userId, inboundId) => {
  const user = await User.findById(userId);
  if (!user || !user.api_key) throw new Error('Valid User with API key required');

  const inbound = await resolveInboundId(user._id, inboundId);

  try {
    const response = await axios.post(
      `https://api-livekit-vyom.indusnettechnologies.com/inbound/detach/${inbound.external_inbound_id}`,
      {},
      {
        headers: { 'Authorization': `Bearer ${user.api_key}` },
        httpsAgent: getAgent()
      }
    );

    // Update Local DB (Set relations to null)
    await Inbound.findByIdAndUpdate(inbound._id, {
      $set: {
        assistant_id: null,
        external_assistant_id: null,
        inbound_context_strategy_id: null
      }
    });

    return response.data;
  } catch (error) {
    if (error.response) throw new Error(error.response.data.message || 'Failed to detach inbound mapping externally');
    throw new Error('Failed to contact external service');
  }
};

// --- 5. Delete Inbound Number ---
const deleteInbound = async (userId, inboundId) => {
  const user = await User.findById(userId);
  if (!user || !user.api_key) throw new Error('Valid User with API key required');

  const inbound = await resolveInboundId(user._id, inboundId);

  try {
    const response = await axios.delete(
      `https://api-livekit-vyom.indusnettechnologies.com/inbound/delete/${inbound.external_inbound_id}`,
      {
        headers: { 'Authorization': `Bearer ${user.api_key}` },
        httpsAgent: getAgent()
      }
    );

    // Delete locally
    await Inbound.findByIdAndDelete(inbound._id);
    return response.data;
  } catch (error) {
    if (error.response) throw new Error(error.response.data.message || 'Failed to delete inbound mapping externally');
    throw new Error('Failed to contact external service');
  }
};

module.exports = {
  assignInbound,
  listInbound,
  updateInbound,
  detachInbound,
  deleteInbound
};