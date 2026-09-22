const User = require('../db/schemas/user.model');

/**
 * Bearer-key authentication. Identity is the upstream LiveKit key the user was issued at
 * signup, sent the way the upstream API takes it: `Authorization: Bearer <api_key>`.
 * Anything else — a body field, a query param — is data, never identity.
 *
 * Sets `req.user` to the matching user document and calls next(). Throws with `err.status`
 * so the central error handler shapes the body.
 */
const requireAuth = async (req, res, next) => {
  try {
    const header = req.get('authorization') || '';
    const [scheme, token] = header.split(' ');

    // One message for "no header" and "bad scheme": do not tell a prober which half failed.
    if (!token || scheme.toLowerCase() !== 'bearer') {
      const error = new Error('Authorization header with a Bearer API key is required');
      error.status = 401;
      throw error;
    }

    const user = await User.findOne({ api_key: token });
    if (!user) {
      // Same status and shape as the missing-header case, and the token is never echoed.
      const error = new Error('Invalid API key');
      error.status = 401;
      throw error;
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = requireAuth;
