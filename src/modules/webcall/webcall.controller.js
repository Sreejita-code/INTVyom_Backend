const webCallService = require('./webcall.service');

const getToken = async (req, res) => {
  try {
    // --- ADDED LOGGING ---
    console.log("\n=== [WebCall Controller] /get-token API Hit ===");
    console.log("Incoming Payload from Frontend:", req.body);
    // ---------------------

    const { user_id, assistant_id, metadata, text_only } = req.body;

    if (!user_id || !assistant_id) {
      console.warn("[WebCall Controller] Warning: Missing user_id or assistant_id");
      return res.status(400).json({ 
        error: 'user_id and assistant_id are required' 
      });
    }

    const result = await webCallService.generateWebCallToken(req.body);

    console.log("[WebCall Controller] Token generated successfully.");
    res.status(200).json(result);
  } catch (error) {
    console.error("[WebCall Controller] Error:", error.message);
    res.status(error.message.includes('not found') ? 404 : 500).json({ 
      error: error.message 
    });
  }
};

module.exports = {
  getToken
};