const mongoose = require('mongoose');
const { getLogger } = require('../../logging/logger');

const logger = getLogger('db');

const UserSchema = new mongoose.Schema({
  // Unique: login looks the user up by user_name, so two rows sharing one would lock the second
  // out for good. Exact match, case-sensitive, like the login lookup. The index cannot build
  // while duplicates exist — run scripts/audit-duplicate-usernames.js first.
  user_name: { type: String, required: true, unique: true },
  org_name: { type: String, required: true },
  user_email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  // Indexed: every authenticated request looks the user up by this value (requireAuth).
  // Deliberately NOT `unique` — issuance is non-fatal at signup, so multiple users may hold
  // `null`, which a plain unique index cannot express. A null api_key never authenticates:
  // the lookup is by token value, so no token equals null.
  api_key: { type: String, index: true } // To store the key from the external API
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);

// Mongoose swallows index-build failures, so without this a duplicate user_name would leave the
// unique index missing with no trace. Fix: node scripts/audit-duplicate-usernames.js.
User.on('index', (error) => {
  if (error) logger.error(`users index build failed (duplicate user_name?): ${error.message}`);
});

module.exports = User;