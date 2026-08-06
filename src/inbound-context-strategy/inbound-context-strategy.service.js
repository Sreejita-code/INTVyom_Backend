const InboundContextStrategy = require('../core/db/schemas/inbound-context-strategy.model');
const Inbound = require('../core/db/schemas/inbound.model');
const { callExternal } = require('../services/livekit/livekitService');
const getUserWithKey = require('../auth/userAccess');
const findByLocalOrExternalId = require('../core/db/functions/findByLocalOrExternalId');

const PREFIX = '/inbound_context_strategy';

/**
 * This external endpoint reports errors three different ways: `error` for its own
 * failures, `message` for the shared envelope, and a FastAPI `detail` array for request
 * validation (bad url, timeout out of range, a masked `****` header echoed back).
 * Flatten `detail` to "strategy_config.url: url must use http or https" instead of
 * dumping raw JSON at the caller.
 */
const strategyError = (data) => {
  if (!data) return 'External API Error';
  if (data.error) return data.error;
  if (data.message) return data.message;
  if (Array.isArray(data.detail)) {
    const lines = data.detail
      .map((d) => {
        // loc[0] is always "body"; the rest is the field path the caller actually sent.
        const field = Array.isArray(d.loc) ? d.loc.slice(1).join('.') : '';
        return field ? `${field}: ${d.msg}` : d.msg;
      })
      .filter(Boolean);
    if (lines.length) return lines.join('; ');
  }
  if (typeof data.detail === 'string') return data.detail;
  return JSON.stringify(data) || 'External API Error';
};

// Helper to resolve Strategy ID (Local Mongo vs External)
const resolveStrategyId = async (userId, strategyId) => {
  const strategy = await findByLocalOrExternalId(InboundContextStrategy, strategyId, userId, 'external_strategy_id');
  if (!strategy) {
    const error = new Error('Strategy not found');
    error.status = 404;
    throw error;
  }
  return strategy;
};

// --- 1. Create Strategy ---
const createStrategy = async (data) => {
  // Accept either the local field names or the upstream ones.
  const name = data.name || data.strategy_name;
  const type = data.type || data.strategy_type || 'webhook';
  const strategy_config = data.strategy_config;

  const user = await getUserWithKey(data.user_id);

  // Upstream owns validation of url / headers / timeout_seconds — send the config through
  // untouched. `type` is NOT a strategy_config key; it belongs at the top level only.
  const externalPayload = {
    strategy_name: name,
    strategy_type: type,
    strategy_config,
  };

  const externalResponseData = await callExternal(user.api_key, {
    method: 'post',
    path: `${PREFIX}/create`,
    data: externalPayload,
    extractMessage: strategyError,
    networkFallback: 'Failed to create strategy externally',
  });

  // Local mirror is identity only — enough to resolve a local _id to the external id.
  // strategy_config is deliberately not mirrored: upstream merges headers key by key and
  // masks secrets on read, so any local copy goes stale after the first partial update.
  const extData = externalResponseData.data || externalResponseData;
  const newStrategy = new InboundContextStrategy({
    user_id: user._id,
    external_strategy_id: extData.strategy_id || extData.id,
    name: extData.strategy_name || extData.name || name,
    type: extData.strategy_type || extData.type || type,
  });

  await newStrategy.save();
  return externalResponseData;
};

// --- 2. List Strategies ---
const listStrategies = async (userId) => {
  const user = await getUserWithKey(userId);
  return callExternal(user.api_key, {
    path: `${PREFIX}/list`,
    extractMessage: strategyError,
    networkFallback: 'Failed to fetch strategies',
  });
};

// --- 3. Get Details ---
const getStrategyDetails = async (userId, strategyId) => {
  const user = await getUserWithKey(userId);
  const strategy = await resolveStrategyId(user._id, strategyId);
  return callExternal(user.api_key, {
    path: `${PREFIX}/details/${strategy.external_strategy_id}`,
    extractMessage: strategyError,
    networkFallback: 'Failed to fetch strategy details',
  });
};

// --- 4. Update Strategy ---
const updateStrategy = async (userId, strategyId, updateData) => {
  const user = await getUserWithKey(userId);

  const strategy = await resolveStrategyId(user._id, strategyId);

  const name = updateData.name || updateData.strategy_name;
  const type = updateData.type || updateData.strategy_type;
  const { strategy_config } = updateData;

  const externalPayload = {};
  if (name) externalPayload.strategy_name = name;

  // Upstream rejects strategy_type and strategy_config unless they arrive together, so
  // send the pair whenever either one is present, filling type from the stored value.
  if (strategy_config !== undefined || type) {
    externalPayload.strategy_type = type || strategy.type || 'webhook';
    // Forwarded verbatim, including null-valued headers — that is how upstream deletes a
    // single header. Only the keys sent are touched; the rest are merged and kept.
    externalPayload.strategy_config = strategy_config;
  }

  if (Object.keys(externalPayload).length === 0) {
    const error = new Error('No fields provided for update');
    error.status = 400;
    throw error;
  }

  const result = await callExternal(user.api_key, {
    method: 'patch',
    path: `${PREFIX}/update/${strategy.external_strategy_id}`,
    data: externalPayload,
    extractMessage: strategyError,
    networkFallback: 'Failed to update strategy externally',
  });

  // Sync Local DB (identity fields only)
  const localUpdate = {};
  if (name) localUpdate.name = name;
  if (type) localUpdate.type = type;

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
    extractMessage: strategyError,
    networkFallback: 'Failed to delete strategy externally',
  });

  // Upstream deactivates the strategy AND detaches it from every mapping that referenced
  // it. Mirror that cascade locally, otherwise our inbound rows keep a dangling id.
  await Inbound.updateMany(
    { user_id: user._id, inbound_context_strategy_id: strategy.external_strategy_id },
    { $set: { inbound_context_strategy_id: null } }
  );

  await InboundContextStrategy.findByIdAndDelete(strategy._id);
  return result;
};

module.exports = {
  createStrategy,
  listStrategies,
  getStrategyDetails,
  updateStrategy,
  deleteStrategy,
  strategyError,
};
