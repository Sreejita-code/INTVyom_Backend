const bcrypt = require('bcryptjs');
const User = require('../core/db/schemas/user.model');
const { callExternal } = require('../services/livekit/livekitService');
const { getLogger } = require('../core/logging/logger');

const logger = getLogger('auth');

// Key issuance is the one unauthenticated upstream call — the key is what it returns.
const requestExternalApiKey = (user_name, org_name, user_email) =>
  callExternal(null, {
    path: '/auth/create-key',
    method: 'post',
    data: { user_name, org_name, user_email },
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    fallback: 'External key issuance failed',
    networkFallback: 'Failed to contact external key service',
  });

// --- 1. Register User ---
const registerUser = async (userData) => {
  const { user_name, org_name, user_email, password } = userData;

  // 1. Check if user already exists in OUR database. Both checks run before key issuance, so a
  // rejected signup never mints an upstream key.
  const existingUser = await User.findOne({ user_email });
  if (existingUser) {
    throw new Error('User with this email already exists');
  }
  if (await User.findOne({ user_name })) {
    throw new Error('User name is already taken');
  }

  // 2. Hash the password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  // 3. Call External API
  let externalApiKey = null;

  try {
    // The response carries the issued key — never log its body.
    const resData = await requestExternalApiKey(user_name, org_name, user_email);

    externalApiKey =
      resData.api_key ||
      resData.key ||
      resData.token ||
      (resData.data && resData.data.api_key);

    if (!externalApiKey) {
      logger.warn(`key issuance succeeded but returned no key for ${user_email}`);
    }
  } catch (error) {
    // Deliberately non-fatal: local user creation proceeds with api_key = null.
    logger.error(
      `key issuance failed for ${user_email} (status ${error.status || 'network'}): ${error.message}`
    );
  }

  // 4. Save User to DB
  const newUser = new User({
    user_name,
    org_name,
    user_email,
    password: hashedPassword,
    api_key: externalApiKey // Will be null if external call failed
  });

  try {
    return await newUser.save();
  } catch (error) {
    // Two concurrent signups can both pass the checks above; the unique indexes catch the loser.
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0];
      throw new Error(field === 'user_email' ? 'User with this email already exists' : 'User name is already taken');
    }
    throw error;
  }
};

// --- 2. Login User ---
const loginUser = async (loginData) => {
  const { user_name, password } = loginData;
  const user = await User.findOne({ user_name });
  
  if (!user) throw new Error('Invalid credentials');

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw new Error('Invalid credentials');

  return user;
};

module.exports = {
  registerUser,
  loginUser
};