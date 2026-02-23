const integrationService = require('./integration.service');

// --- 1. Store Controller ---
const store = async (req, res) => {
  try {
    const { user_id, service_type, service_name, api_key } = req.body;

    if (!user_id || !service_name || !api_key) {
      return res.status(400).json({ 
        error: 'user_id, service_name, and api_key are required' 
      });
    }

    const result = await integrationService.storeApiKey(req.body);

    res.status(200).json({
      success: true,
      message: 'Integration API key saved successfully',
      data: {
        service_type: result.service_type,
        service_name: result.service_name,
        // Optional: Mask the API key in the response for security
        api_key_preview: `***${result.api_key.slice(-4)}` 
      }
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// --- 2. Get Controller ---
const get = async (req, res) => {
  try {
    const { user_id, service_name } = req.query;

    if (!user_id || !service_name) {
      return res.status(400).json({ 
        error: 'user_id and service_name query parameters are required' 
      });
    }

    const result = await integrationService.getApiKey(user_id, service_name);

    res.status(200).json({
      success: true,
      data: {
        service_type: result.service_type,
        service_name: result.service_name,
        api_key: result.api_key // Return the full key here so your backend can use it
      }
    });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  store,
  get
};