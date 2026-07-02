const integrationService = require('./integration.service');
const User = require('../auth/user.model');

// --- 1. Store Controller ---
const store = async (req, res) => {
  try {
    const { user_id, service_type, service_name, api_key } = req.body;

    if (!user_id || !service_name || !api_key) {
      return res.status(400).json({ 
        error: 'user_id, service_name, and api_key are required' 
      });
    }

    const { integration, resync } = await integrationService.storeApiKey(req.body);

    res.status(200).json({
      success: true,
      message: 'Integration API key saved successfully',
      data: {
        service_type: integration.service_type,
        service_name: integration.service_name,
        // Optional: Mask the API key in the response for security
        api_key_preview: `***${integration.api_key.slice(-4)}`
      },
      // Existing assistants using this provider are re-pushed the new key.
      resync
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

// --- 3. Re-sync Status ---
const resyncStatus = async (req, res) => {
  try {
    const { user_id, service_name } = req.query;
    if (!user_id || !service_name) {
      return res.status(400).json({ error: 'user_id and service_name query parameters are required' });
    }

    const job = await integrationService.getResyncStatus(user_id, service_name);
    if (!job) {
      return res.status(404).json({ error: 'No re-sync job found for this user and service' });
    }

    res.status(200).json({ success: true, data: job });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// --- 4. Trigger Re-sync (manual retry / button) ---
const resync = async (req, res) => {
  try {
    const { user_id, service_name } = req.body;
    if (!user_id || !service_name) {
      return res.status(400).json({ error: 'user_id and service_name are required' });
    }

    const user = await User.findById(user_id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const result = await integrationService.startResync(user, service_name.toLowerCase());
    res.status(202).json({ success: true, resync: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  store,
  get,
  resyncStatus,
  resync
};