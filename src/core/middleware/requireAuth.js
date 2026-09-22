const User = require('../db/schemas/user.model');

const unauthorized = (message) => {
  const error = new Error(message);
  error.status = 401;
  return error;
};

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
    // Split on any whitespace run: `Bearer  key` is a valid header, `Bearer key junk` is not.
    const parts = (req.get('authorization') || '').trim().split(/\s+/);
    const [scheme, token] = parts;

    // One message for "no header" and "bad scheme": do not tell a prober which half failed.
    if (parts.length !== 2 || scheme.toLowerCase() !== 'bearer') {
      throw unauthorized('Authorization header with a Bearer API key is required');
    }

    const user = await User.findOne({ api_key: token });
    // Same status and shape as the missing-header case, and the token is never echoed.
    if (!user) throw unauthorized('Invalid API key');

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = requireAuth;
