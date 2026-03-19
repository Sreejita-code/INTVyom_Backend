const strategyService = require('./inbound-context-strategy.service');

const create = async (req, res) => {
  try {
    const { user_id, name, type, strategy_config } = req.body;

    if (!user_id || !name || !strategy_config || !strategy_config.url) {
      return res.status(400).json({ 
        error: 'user_id, name, and strategy_config (with url) are required' 
      });
    }

    const result = await strategyService.createStrategy(req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const list = async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'user_id query parameter is required' });
    
    const result = await strategyService.listStrategies(user_id);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const details = async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.query;
    
    if (!user_id || !id) return res.status(400).json({ error: 'user_id and strategy ID are required' });
    
    const result = await strategyService.getStrategyDetails(user_id, id);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, ...updateData } = req.body;
    
    if (!user_id || !id) {
      return res.status(400).json({ error: 'user_id in body and strategy ID in params are required' });
    }

    const result = await strategyService.updateStrategy(user_id, id, updateData);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteStrategy = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.query.user_id || req.body.user_id;

    if (!userId || !id) {
      return res.status(400).json({ error: 'user_id and strategy ID are required' });
    }

    const result = await strategyService.deleteStrategy(userId, id);
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
  deleteStrategy
};