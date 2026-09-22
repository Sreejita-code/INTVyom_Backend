const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  user_name: { type: String, required: true },
  org_name: { type: String, required: true },
  user_email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  // Indexed: every authenticated request looks the user up by this value (requireAuth).
  // Deliberately NOT `unique` — issuance is non-fatal at signup, so multiple users may hold
  // `null`, which a plain unique index cannot express. A null api_key never authenticates:
  // the lookup is by token value, so no token equals null.
  api_key: { type: String, index: true } // To store the key from the external API
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);