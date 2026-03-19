const inboundService = require('./inbound.service');

const assign = async (req, res) => {
  try {
    const { user_id, assistant_id, service, inbound_config } = req.body;

    if (!user_id || !assistant_id || !service || !inbound_config || !inbound_config.phone_number) {
      return res.status(400).json({ 
        error: 'user_id, assistant_id, service, and inbound_config (with phone_number) are required' 
      });
    }

    const result = await inboundService.assignInbound(req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const list = async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'user_id query parameter is required' });
    
    const result = await inboundService.listInbound(user_id);
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
      return res.status(400).json({ error: 'user_id in body and inbound ID in params are required' });
    }

    const result = await inboundService.updateInbound(user_id, id, updateData);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const detach = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.query.user_id || req.body.user_id;

    if (!userId || !id) {
      return res.status(400).json({ error: 'user_id and inbound ID are required' });
    }

    const result = await inboundService.detachInbound(userId, id);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteInbound = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.query.user_id || req.body.user_id;

    if (!userId || !id) {
      return res.status(400).json({ error: 'user_id and inbound ID are required' });
    }

    const result = await inboundService.deleteInbound(userId, id);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  assign,
  list,
  update,
  detach,
  deleteInbound
};