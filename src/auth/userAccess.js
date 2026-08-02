const User = require('../core/db/schemas/user.model');

/**
 * Load a user and require they have an API key — the guard shared by every
 * service that calls the external LiveKit API. Throws with err.status so the
 * central error handler maps 404/400 correctly.
 */
const getUserWithKey = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }
  if (!user.api_key) {
    const error = new Error('User does not have an API Key. Please generate one first.');
    error.status = 400;
    throw error;
  }
  return user;
};

module.exports = getUserWithKey;
