const webCallService = require('./webcall.service');

const getToken = async (req, res) => {
  try {
    const { user_id, assistant_id, metadata } = req.body;

    if (!user_id || !assistant_id) {
      return res.status(400).json({ 
        error: 'user_id and assistant_id are required' 
      });
    }

    const result = await webCallService.generateWebCallToken(req.body);

    res.status(200).json(result);
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 500).json({ 
      error: error.message 
    });
  }
};

module.exports = {
  getToken
};