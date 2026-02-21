const sipService = require('./sip.service');

const createOutboundTrunk = async (req, res) => {
  try {
    const { user_id, trunk_name, trunk_type, trunk_config } = req.body;

    // Basic Validation
    if (!user_id || !trunk_name || !trunk_type || !trunk_config) {
      return res.status(400).json({ 
        error: 'user_id, trunk_name, trunk_type, and trunk_config are required' 
      });
    }

    const trunk = await sipService.createOutboundTrunk(req.body);

    res.status(201).json({
      message: 'Outbound trunk created successfully locally and externally',
      trunk: trunk
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const list = async (req, res) => {
  try {
    // Expecting user_id in the query string (e.g., /api/sip/list?user_id=123)
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id query parameter is required' });
    }

    const result = await sipService.listSipTrunks(user_id);
    
    // Return the list to the client
    res.status(200).json(result);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createOutboundTrunk,
  list // Export the new controller function
};