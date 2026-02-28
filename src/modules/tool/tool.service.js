const axios = require('axios');
const https = require('https');
const Tool = require('./tool.model');
const User = require('../auth/user.model');
const Assistant = require('../assistant/assistant.model');

// Helper to get agent
const getAgent = () => new https.Agent({ rejectUnauthorized: false });

const createTool = async (userId, toolData) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');
  if (!user.api_key) throw new Error('User does not have an API Key.');

  let externalResponseData = null;

  try {
    const response = await axios.post(
      'https://api-livekit-vyom.indusnettechnologies.com/tool/create',
      toolData,
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
    throw new Error('Failed to create tool externally');
  }

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
  const user = await User.findById(userId);
  if (!user || !user.api_key) throw new Error('Valid User with API key required');

  try {
    const response = await axios.get(
      'https://api-livekit-vyom.indusnettechnologies.com/tool/list',
      {
        headers: { 'Authorization': `Bearer ${user.api_key}` },
        httpsAgent: getAgent()
      }
    );
    return response.data;
  } catch (error) {
    if (error.response) throw new Error(error.response.data.message || 'Failed to fetch tools');
    throw new Error('Failed to contact external service');
  }
};

const getToolDetails = async (userId, toolId) => {
  const user = await User.findById(userId);
  if (!user || !user.api_key) throw new Error('Valid User with API key required');

  try {
    const response = await axios.get(
      `https://api-livekit-vyom.indusnettechnologies.com/tool/details/${toolId}`,
      {
        headers: { 'Authorization': `Bearer ${user.api_key}` },
        httpsAgent: getAgent()
      }
    );
    return response.data;
  } catch (error) {
    if (error.response) throw new Error(error.response.data.message || 'Failed to fetch tool details');
    throw new Error('Failed to contact external service');
  }
};

const updateTool = async (userId, toolId, updateData) => {
  const user = await User.findById(userId);
  if (!user || !user.api_key) throw new Error('Valid User with API key required');

  try {
    const response = await axios.patch(
      `https://api-livekit-vyom.indusnettechnologies.com/tool/update/${toolId}`,
      updateData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.api_key}`
        },
        httpsAgent: getAgent()
      }
    );

    // Update Local DB
    await Tool.findOneAndUpdate(
      { external_tool_id: toolId },
      { $set: updateData }
    );

    return response.data;
  } catch (error) {
    if (error.response) throw new Error(error.response.data.message || 'Failed to update tool externally');
    throw new Error('Failed to contact external service');
  }
};

const deleteTool = async (userId, toolId) => {
  const user = await User.findById(userId);
  if (!user || !user.api_key) throw new Error('Valid User with API key required');

  try {
    const response = await axios.delete(
      `https://api-livekit-vyom.indusnettechnologies.com/tool/delete/${toolId}`,
      {
        headers: { 'Authorization': `Bearer ${user.api_key}` },
        httpsAgent: getAgent()
      }
    );

    // Delete locally
    await Tool.findOneAndDelete({ external_tool_id: toolId });
    return response.data;
  } catch (error) {
    if (error.response) throw new Error(error.response.data.message || 'Failed to delete tool externally');
    throw new Error('Failed to contact external service');
  }
};

// --- Assistant Attachment / Detachment ---

// Helper to resolve local DB IDs to External IDs (supports both)
const resolveExternalIds = async (userId, assistantId, toolIds) => {
  const assistant = await Assistant.findOne({
    $or: [{ _id: assistantId.match(/^[0-9a-fA-F]{24}$/) ? assistantId : null }, { external_assistant_id: assistantId }],
    user_id: userId
  });
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

const attachTools = async (userId, assistantId, toolIds) => {
  const user = await User.findById(userId);
  if (!user || !user.api_key) throw new Error('Valid User with API key required');

  const { extAssistantId, extToolIds } = await resolveExternalIds(user._id, assistantId, toolIds);

  try {
    const response = await axios.post(
      `https://api-livekit-vyom.indusnettechnologies.com/tool/attach/${extAssistantId}`,
      { tool_ids: extToolIds },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.api_key}`
        },
        httpsAgent: getAgent()
      }
    );
    return response.data;
  } catch (error) {
    if (error.response) throw new Error(error.response.data.message || 'Failed to attach tools');
    throw new Error('Failed to contact external service');
  }
};

const detachTools = async (userId, assistantId, toolIds) => {
  const user = await User.findById(userId);
  if (!user || !user.api_key) throw new Error('Valid User with API key required');

  const { extAssistantId, extToolIds } = await resolveExternalIds(user._id, assistantId, toolIds);

  try {
    const response = await axios.post(
      `https://api-livekit-vyom.indusnettechnologies.com/tool/detach/${extAssistantId}`,
      { tool_ids: extToolIds },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.api_key}`
        },
        httpsAgent: getAgent()
      }
    );
    return response.data;
  } catch (error) {
    if (error.response) throw new Error(error.response.data.message || 'Failed to detach tools');
    throw new Error('Failed to contact external service');
  }
};

module.exports = {
  createTool,
  listTools,
  getToolDetails,
  updateTool,
  deleteTool,
  attachTools,
  detachTools
};