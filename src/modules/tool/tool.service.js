const Tool = require('./tool.model');
const Assistant = require('../assistant/assistant.model');
const { callExternal, getUserWithKey, findByLocalOrExternalId } = require('../shared/remote');

const createTool = async (userId, toolData) => {
  const user = await getUserWithKey(userId);

  const externalResponseData = await callExternal(user.api_key, {
    method: 'post',
    path: '/tool/create',
    data: toolData,
    networkFallback: 'Failed to create tool externally',
  });

  // Save to Local DB
  const newTool = new Tool({
    user_id: user._id,
    external_tool_id: externalResponseData.data.tool_id,
    tool_name: toolData.tool_name,
    tool_description: toolData.tool_description,
    tool_execution_type: toolData.tool_execution_type,
    tool_parameters: toolData.tool_parameters || [],
    tool_execution_config: toolData.tool_execution_config
  });

  await newTool.save();
  return externalResponseData;
};

const listTools = async (userId) => {
  const user = await getUserWithKey(userId);
  return callExternal(user.api_key, { path: '/tool/list', fallback: 'Failed to fetch tools' });
};

const getToolDetails = async (userId, toolId) => {
  const user = await getUserWithKey(userId);
  return callExternal(user.api_key, {
    path: `/tool/details/${toolId}`,
    fallback: 'Failed to fetch tool details',
  });
};

const updateTool = async (userId, toolId, updateData) => {
  const user = await getUserWithKey(userId);

  const result = await callExternal(user.api_key, {
    method: 'patch',
    path: `/tool/update/${toolId}`,
    data: updateData,
    fallback: 'Failed to update tool externally',
  });

  // Update Local DB
  await Tool.findOneAndUpdate({ external_tool_id: toolId }, { $set: updateData });
  return result;
};

const deleteTool = async (userId, toolId) => {
  const user = await getUserWithKey(userId);

  const result = await callExternal(user.api_key, {
    method: 'delete',
    path: `/tool/delete/${toolId}`,
    fallback: 'Failed to delete tool externally',
  });

  // Delete locally
  await Tool.findOneAndDelete({ external_tool_id: toolId });
  return result;
};

// --- Assistant Attachment / Detachment ---

// Helper to resolve local DB IDs to External IDs (supports both)
const resolveExternalIds = async (userId, assistantId, toolIds) => {
  const assistant = await findByLocalOrExternalId(Assistant, assistantId, userId, 'external_assistant_id');
  if (!assistant) throw new Error('Assistant not found');

  const tools = await Tool.find({
    $or: [
      { _id: { $in: toolIds.filter(id => id.match(/^[0-9a-fA-F]{24}$/)) } },
      { external_tool_id: { $in: toolIds } }
    ],
    user_id: userId
  });

  // Extract external IDs for tools provided
  const externalToolIds = tools.map(t => t.external_tool_id);

  // If some tools were not found locally but are passed directly as external strings, we assume they are external IDs
  const missingIds = toolIds.filter(id => !tools.some(t => t._id.toString() === id || t.external_tool_id === id));
  externalToolIds.push(...missingIds);

  return { extAssistantId: assistant.external_assistant_id, extToolIds: externalToolIds };
};

// attach/detach differ only by the URL verb and the failure message.
const attachOrDetach = async (userId, assistantId, toolIds, action) => {
  const user = await getUserWithKey(userId);
  const { extAssistantId, extToolIds } = await resolveExternalIds(user._id, assistantId, toolIds);

  return callExternal(user.api_key, {
    method: 'post',
    path: `/tool/${action}/${extAssistantId}`,
    data: { tool_ids: extToolIds },
    fallback: `Failed to ${action} tools`,
  });
};

const attachTools = (userId, assistantId, toolIds) => attachOrDetach(userId, assistantId, toolIds, 'attach');
const detachTools = (userId, assistantId, toolIds) => attachOrDetach(userId, assistantId, toolIds, 'detach');

module.exports = {
  createTool,
  listTools,
  getToolDetails,
  updateTool,
  deleteTool,
  attachTools,
  detachTools
};
