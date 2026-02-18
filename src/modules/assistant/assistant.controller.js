const assistantService = require('./assistant.service');

// --- 1. Create Controller (Existing) ---
const create = async (req, res) => {
  try {
    // Expected body: { user_id, assistant_name, ... }
    const assistant = await assistantService.createAssistant(req.body);

    res.status(201).json({
      message: 'Assistant created successfully',
      assistant: assistant
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// --- 2. List Controller (New) ---
const list = async (req, res) => {
  try {
    // We expect the user_id to be passed as a query parameter
    // Example: GET /api/assistant/list?user_id=12345
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id query parameter is required' });
    }

    // Call the service to fetch the list from the external API
    const result = await assistantService.listAssistants(user_id);
    
    // Return the result directly (it already contains success/message/data structure)
    res.status(200).json(result);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  create,
  list
};