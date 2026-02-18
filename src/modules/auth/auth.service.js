const axios = require('axios');
const bcrypt = require('bcryptjs');
const User = require('./user.model');

// --- 1. Register User (Existing Logic) ---
const registerUser = async (userData) => {
  const { user_name, org_name, user_email, password } = userData;

  // Check if user already exists
  const existingUser = await User.findOne({ user_email });
  if (existingUser) {
    throw new Error('User with this email already exists');
  }

  // Hash the password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  // Call the External API to create a key
  let externalApiKey = null;
  try {
    const externalResponse = await axios.post(
      'https://api-livekit-vyom.indusnettechnologies.com/auth/create-key',
      {
        user_name,
        org_name,
        user_email
      }
    );

    // Capture the key from the response
    externalApiKey = externalResponse.data.key || externalResponse.data.api_key || externalResponse.data.token;
    
    if (!externalApiKey) {
      console.warn("External API did not return a key field. Storing null.");
    }

  } catch (error) {
    console.error('External API Call Failed:', error.message);
    throw new Error('Failed to generate API key from external service');
  }

  // Save User to DB
  const newUser = new User({
    user_name,
    org_name,
    user_email,
    password: hashedPassword,
    api_key: externalApiKey
  });

  return await newUser.save();
};

// --- 2. Get API Key (Existing Logic) ---
const getApiKeyByUserName = async (userName) => {
  // Find the user specifically by user_name
  const user = await User.findOne({ user_name: userName });

  if (!user) {
    throw new Error('User not found');
  }

  // Ensure the key exists before returning
  if (!user.api_key) {
    throw new Error('No API key found for this user');
  }

  return user.api_key;
};

// --- 3. Login User (New Logic) ---
const loginUser = async (loginData) => {
  const { user_name, password } = loginData;

  // Find user by user_name
  // We use findOne to locate the record based on the user_name field
  const user = await User.findOne({ user_name });

  if (!user) {
    throw new Error('Invalid credentials');
  }

  // Verify Password
  // We compare the plain text password provided with the hashed password in the DB
  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    throw new Error('Invalid credentials');
  }

  // Return the user object (controller will handle sending response)
  return user;
};

// Export all functions
module.exports = {
  registerUser,
  getApiKeyByUserName,
  loginUser
};