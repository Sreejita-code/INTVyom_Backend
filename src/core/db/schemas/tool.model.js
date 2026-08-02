const mongoose = require('mongoose');

const ToolSchema = new mongoose.Schema({
  user_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  external_tool_id: { type: String, required: true },
  tool_name: { type: String, required: true },
  tool_description: { type: String },
  tool_execution_type: { type: String, required: true }, // e.g., 'webhook', 'static_return'
  tool_parameters: { type: Array, default: [] },
  tool_execution_config: { type: Object, required: true }
}, { timestamps: true });

module.exports = mongoose.model('Tool', ToolSchema);