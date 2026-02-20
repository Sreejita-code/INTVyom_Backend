const assistantService = require('./assistant.service');

// --- 1. Create Controller (Existing) ---
const create = async (req, res) => {
  try {
    const assistant = await assistantService.createAssistant(req.body);

    res.status(201).json({
      message: 'Assistant created successfully',
      assistant: assistant
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// --- 2. List Controller (Existing) ---
const list = async (req, res) => {
  try {
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id query parameter is required' });
    }

    const result = await assistantService.listAssistants(user_id);
    res.status(200).json(result);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// --- 3. Details Controller (Existing) ---
const details = async (req, res) => {
  try {
    const { user_id } = req.query;
    const { id } = req.params;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id query parameter is required' });
    }

    if (!id) {
      return res.status(400).json({ error: 'Assistant ID is required' });
    }

    const result = await assistantService.getAssistantDetails(user_id, id);
    res.status(200).json(result);

  } catch (error) {
    if (error.message === 'Assistant not found in external system') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
};

// --- 4. Update Controller (Existing) ---
const update = async (req, res) => {
  try {
    const { id } = req.params; 
    const { user_id, ...updateData } = req.body; 

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required in the request body' });
    }

    if (!id) {
      return res.status(400).json({ error: 'Assistant ID is required' });
    }

    const result = await assistantService.updateAssistant(user_id, id, updateData);
    res.status(200).json(result);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// --- 5. Delete Controller (New) ---
const deleteAssistant = async (req, res) => {
  try {
    const { id } = req.params;
    // user_id can be sent in query string or body depending on frontend implementation
    const userId = req.query.user_id || req.body.user_id;

    if (!userId) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    if (!id) {
      return res.status(400).json({ error: 'Assistant ID is required' });
    }

    const result = await assistantService.deleteAssistant(userId, id);
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
  deleteAssistant // Export the new function
};