const callService = require('./call.service');

const outboundCall = async (req, res) => {
  try {
    const { user_id, assistant_id, trunk_id, to_number } = req.body;

    if (!user_id || !assistant_id || !trunk_id || !to_number) {
      return res.status(400).json({ 
        error: 'user_id, assistant_id, trunk_id, and to_number are all required' 
      });
    }

    const result = await callService.makeOutboundCall(req.body);

    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

module.exports = {
  outboundCall
};