const InboundContextStrategy = require('./inbound-context-strategy.model');
const { callExternal, getUserWithKey, findByLocalOrExternalId } = require('../shared/remote');

const PREFIX = '/inbound_context_strategy';

// This external endpoint returns errors under `error` (not `message`).
const strategyError = (data) => data.error || JSON.stringify(data) || 'External API Error';

// Helper to resolve Strategy ID (Local Mongo vs External)
const resolveStrategyId = async (userId, strategyId) => {
  const strategy = await findByLocalOrExternalId(InboundContextStrategy, strategyId, userId, 'external_strategy_id');
  if (!strategy) throw new Error('Strategy not found');
  return strategy;
};

// --- 1. Create Strategy ---
const createStrategy = async (data) => {
  const { user_id, name, type = 'webhook', strategy_config } = data;

  const user = await getUserWithKey(user_id);

  // MAPPING FOR EXTERNAL API STRICT SCHEMA
  const externalPayload = {
    strategy_name: name,
    strategy_type: type,
    strategy_config: {
      type: type, // Injecting the discriminator tag required by the API
      ...strategy_config
    }
  };

  const externalResponseData = await callExternal(user.api_key, {
    method: 'post',
    path: `${PREFIX}/create`,
    data: externalPayload,
    extractMessage: strategyError,
    networkFallback: 'Failed to create strategy externally',
  });

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
  const user = await getUserWithKey(userId);
  return callExternal(user.api_key, { path: `${PREFIX}/list`, fallback: 'Failed to fetch strategies' });
};

// --- 3. Get Details ---
const getStrategyDetails = async (userId, strategyId) => {
  const user = await getUserWithKey(userId);
  const strategy = await resolveStrategyId(user._id, strategyId);
  return callExternal(user.api_key, {
    path: `${PREFIX}/details/${strategy.external_strategy_id}`,
    fallback: 'Failed to fetch strategy details',
  });
};

// --- 4. Update Strategy ---
const updateStrategy = async (userId, strategyId, updateData) => {
  const user = await getUserWithKey(userId);

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

  const result = await callExternal(user.api_key, {
    method: 'patch',
    path: `${PREFIX}/update/${strategy.external_strategy_id}`,
    data: externalPayload,
    extractMessage: (d) => d.error || JSON.stringify(d) || 'Failed to update strategy externally',
  });

  // Sync Local DB
  const localUpdate = {};
  if (updateData.name) localUpdate.name = updateData.name;
  if (updateData.strategy_config) localUpdate.strategy_config = updateData.strategy_config;

  if (Object.keys(localUpdate).length > 0) {
    await InboundContextStrategy.findByIdAndUpdate(strategy._id, { $set: localUpdate });
  }

  return result;
};

// --- 5. Delete Strategy ---
const deleteStrategy = async (userId, strategyId) => {
  const user = await getUserWithKey(userId);

  const strategy = await resolveStrategyId(user._id, strategyId);

  const result = await callExternal(user.api_key, {
    method: 'delete',
    path: `${PREFIX}/delete/${strategy.external_strategy_id}`,
    fallback: 'Failed to delete strategy externally',
  });

  // Delete locally
  await InboundContextStrategy.findByIdAndDelete(strategy._id);
  return result;
};

module.exports = {
  createStrategy,
  listStrategies,
  getStrategyDetails,
  updateStrategy,
  deleteStrategy
};
