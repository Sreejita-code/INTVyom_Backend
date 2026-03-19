const axios = require('axios');
const https = require('https');
const InboundContextStrategy = require('./inbound-context-strategy.model');
const User = require('../auth/user.model');

const getAgent = () => new https.Agent({ rejectUnauthorized: false });
const API_BASE = 'https://api-livekit-vyom.indusnettechnologies.com/inbound_context_strategy';

// Helper to resolve Strategy ID (Local Mongo vs External)
const resolveStrategyId = async (userId, strategyId) => {
  const strategy = await InboundContextStrategy.findOne({
    $or: [
      { _id: strategyId.match(/^[0-9a-fA-F]{24}$/) ? strategyId : null },
      { external_strategy_id: strategyId }
    ],
    user_id: userId
  });
  if (!strategy) throw new Error('Strategy not found');
  return strategy;
};

// --- 1. Create Strategy ---
const createStrategy = async (data) => {
  const { user_id, name, type = 'webhook', strategy_config } = data;

  const user = await User.findById(user_id);
  if (!user || !user.api_key) throw new Error('Valid User with API key required');

  // MAPPING FOR EXTERNAL API STRICT SCHEMA
  const externalPayload = { 
    strategy_name: name, 
    strategy_type: type, 
    strategy_config: {
      type: type, // Injecting the discriminator tag required by the API
      ...strategy_config
    }
  };

  let externalResponseData = null;

  try {
    const response = await axios.post(`${API_BASE}/create`, externalPayload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${user.api_key}`
      },
      httpsAgent: getAgent()
    });
    externalResponseData = response.data;
  } catch (error) {
    if (error.response) throw new Error(error.response.data.error || JSON.stringify(error.response.data) || 'External API Error');
    throw new Error('Failed to create strategy externally');
  }

  // Save to Local DB (safely handling whether API returns strategy_name or name)
  const extData = externalResponseData.data || externalResponseData;
  const newStrategy = new InboundContextStrategy({
    user_id: user._id,
    external_strategy_id: extData.strategy_id || extData.id,
    name: extData.strategy_name || extData.name || name,
    type: extData.strategy_type || extData.type || type,
    strategy_config: extData.strategy_config || strategy_config
  });

  await newStrategy.save();
  return externalResponseData;
};

// --- 2. List Strategies ---
const listStrategies = async (userId) => {
  const user = await User.findById(userId);
  if (!user || !user.api_key) throw new Error('Valid User with API key required');

  try {
    const response = await axios.get(`${API_BASE}/list`, {
      headers: { 'Authorization': `Bearer ${user.api_key}` },
      httpsAgent: getAgent()
    });
    return response.data;
  } catch (error) {
    if (error.response) throw new Error(error.response.data.message || 'Failed to fetch strategies');
    throw new Error('Failed to contact external service');
  }
};

// --- 3. Get Details ---
const getStrategyDetails = async (userId, strategyId) => {
  const user = await User.findById(userId);
  if (!user || !user.api_key) throw new Error('Valid User with API key required');

  const strategy = await resolveStrategyId(user._id, strategyId);

  try {
    const response = await axios.get(`${API_BASE}/details/${strategy.external_strategy_id}`, {
      headers: { 'Authorization': `Bearer ${user.api_key}` },
      httpsAgent: getAgent()
    });
    return response.data;
  } catch (error) {
    if (error.response) throw new Error(error.response.data.message || 'Failed to fetch strategy details');
    throw new Error('Failed to contact external service');
  }
};

// --- 4. Update Strategy ---
const updateStrategy = async (userId, strategyId, updateData) => {
  const user = await User.findById(userId);
  if (!user || !user.api_key) throw new Error('Valid User with API key required');

  const strategy = await resolveStrategyId(user._id, strategyId);

  // MAPPING FOR EXTERNAL API STRICT SCHEMA
  const externalPayload = {};
  if (updateData.name) {
    externalPayload.strategy_name = updateData.name;
  }
  if (updateData.strategy_config) {
    externalPayload.strategy_config = {
      type: strategy.type, // Re-inject the discriminator tag
      ...updateData.strategy_config
    };
  }

  try {
    const response = await axios.patch(
      `${API_BASE}/update/${strategy.external_strategy_id}`,
      externalPayload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.api_key}`
        },
        httpsAgent: getAgent()
      }
    );

    // Sync Local DB
    const localUpdate = {};
    if (updateData.name) localUpdate.name = updateData.name;
    if (updateData.strategy_config) localUpdate.strategy_config = updateData.strategy_config;
    
    if (Object.keys(localUpdate).length > 0) {
      await InboundContextStrategy.findByIdAndUpdate(strategy._id, { $set: localUpdate });
    }

    return response.data;
  } catch (error) {
    if (error.response) throw new Error(error.response.data.error || JSON.stringify(error.response.data) || 'Failed to update strategy externally');
    throw new Error('Failed to contact external service');
  }
};

// --- 5. Delete Strategy ---
const deleteStrategy = async (userId, strategyId) => {
  const user = await User.findById(userId);
  if (!user || !user.api_key) throw new Error('Valid User with API key required');

  const strategy = await resolveStrategyId(user._id, strategyId);

  try {
    const response = await axios.delete(
      `${API_BASE}/delete/${strategy.external_strategy_id}`,
      {
        headers: { 'Authorization': `Bearer ${user.api_key}` },
        httpsAgent: getAgent()
      }
    );

    // Delete locally
    await InboundContextStrategy.findByIdAndDelete(strategy._id);
    return response.data;
  } catch (error) {
    if (error.response) throw new Error(error.response.data.message || 'Failed to delete strategy externally');
    throw new Error('Failed to contact external service');
  }
};

module.exports = {
  createStrategy,
  listStrategies,
  getStrategyDetails,
  updateStrategy,
  deleteStrategy
};