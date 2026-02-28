const toolService = require('./tool.service');

const create = async (req, res) => {
  try {
    const { user_id, ...toolData } = req.body;
    if (!user_id || !toolData.tool_name || !toolData.tool_execution_type) {
      return res.status(400).json({ error: 'user_id, tool_name, and tool_execution_type are required' });
    }
    const result = await toolService.createTool(user_id, toolData);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const list = async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });
    const result = await toolService.listTools(user_id);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const details = async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.query;
    if (!user_id || !id) return res.status(400).json({ error: 'user_id and tool id are required' });
    const result = await toolService.getToolDetails(user_id, id);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, ...updateData } = req.body;
    if (!user_id || !id) return res.status(400).json({ error: 'user_id and tool id are required' });
    const result = await toolService.updateTool(user_id, id, updateData);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteTool = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.query.user_id || req.body.user_id;
    if (!userId || !id) return res.status(400).json({ error: 'user_id and tool id are required' });
    const result = await toolService.deleteTool(userId, id);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const attach = async (req, res) => {
  try {
    const { assistant_id } = req.params;
    const { user_id, tool_ids } = req.body;
    if (!user_id || !tool_ids || !Array.isArray(tool_ids) || tool_ids.length === 0) {
      return res.status(400).json({ error: 'user_id and a non-empty tool_ids array are required' });
    }
    const result = await toolService.attachTools(user_id, assistant_id, tool_ids);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const detach = async (req, res) => {
  try {
    const { assistant_id } = req.params;
    const { user_id, tool_ids } = req.body;
    if (!user_id || !tool_ids || !Array.isArray(tool_ids)) {
      return res.status(400).json({ error: 'user_id and tool_ids array are required' });
    }
    const result = await toolService.detachTools(user_id, assistant_id, tool_ids);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  create,
  list,
  details,
  update,
  deleteTool,
  attach,
  detach
};