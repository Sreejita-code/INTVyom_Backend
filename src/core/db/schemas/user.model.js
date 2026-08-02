const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  user_name: { type: String, required: true },
  org_name: { type: String, required: true },
  user_email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  api_key: { type: String } // To store the key from the external API
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);