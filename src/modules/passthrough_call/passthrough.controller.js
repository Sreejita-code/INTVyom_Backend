const passthroughService = require('./passthrough.sevice');

const outboundCall = async (req, res) => {
  try {
    const { user_id, trunk_id, to_number } = req.body;
    if (!user_id || !trunk_id || !to_number) {
      return res.status(400).json({ error: 'user_id, trunk_id, and to_number are required' });
    }
    const result = await passthroughService.makePassthroughOutboundCall(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 500).json({ error: error.message });
  }
};

const list = async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }
    const result = await passthroughService.getCallRecords(req.query);
    res.status(200).json(result);
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 500).json({ error: error.message });
  }
};

module.exports = { outboundCall, list };
