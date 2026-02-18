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

// --- 4. Update Controller (New) ---
const update = async (req, res) => {
  try {
    // Usage: PATCH /api/assistant/update/550e84...
    // Body: { "user_id": "...", "assistant_name": "New Name" }
    const { id } = req.params; // Assistant ID from URL
    const { user_id, ...updateData } = req.body; // Extract user_id, keep rest as data

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required in the request body' });
    }

    if (!id) {
      return res.status(400).json({ error: 'Assistant ID is required' });
    }

    // Call service to update external API + local DB
    const result = await assistantService.updateAssistant(user_id, id, updateData);

    res.status(200).json(result);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  create,
  list,
  details,
  update // Export the new function
};