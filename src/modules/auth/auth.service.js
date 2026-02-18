const axios = require('axios');
const bcrypt = require('bcryptjs');
const https = require('https'); 
const User = require('./user.model');

// --- 1. Register User ---
const registerUser = async (userData) => {
  const { user_name, org_name, user_email, password } = userData;

  // 1. Check if user already exists in OUR database
  const existingUser = await User.findOne({ user_email });
  if (existingUser) {
    throw new Error('User with this email already exists');
  }

  // 2. Hash the password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  // 3. Call External API
  let externalApiKey = null;
  
  try {
    const agent = new https.Agent({  
      rejectUnauthorized: false 
    });

    console.log('Sending request to External API with:', { user_name, org_name, user_email });

    const externalResponse = await axios.post(
      'https://api-livekit-vyom.indusnettechnologies.com/auth/create-key',
      {
        user_name: user_name,
        org_name: org_name,
        user_email: user_email
      },
      { 
        httpsAgent: agent,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );

    console.log('External API Response Status:', externalResponse.status);
    console.log('External API Response Data:', JSON.stringify(externalResponse.data, null, 2));

    // Capture the key (adjust based on actual response structure)
    const resData = externalResponse.data;
    externalApiKey = 
      resData.api_key || 
      resData.key || 
      resData.token || 
      (resData.data && resData.data.api_key);

    if (!externalApiKey) {
      console.warn("API Call success, but no key found in response.");
    }

  } catch (error) {
    console.error('--- EXTERNAL API ERROR ---');
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
      
      // If the error is "User already exists" or similar from the external API, 
      // we might want to handle it (e.g., maybe we just grab the key?)
      // For now, we just log it.
    } else {
      console.error('Error Message:', error.message);
    }
    console.error('--------------------------');
    // We do NOT throw here, allowing the local user creation to proceed 
    // (api_key will be null)
  }

  // 4. Save User to DB
  const newUser = new User({
    user_name,
    org_name,
    user_email,
    password: hashedPassword,
    api_key: externalApiKey // Will be null if external call failed
  });

  return await newUser.save();
};

// --- 2. Get API Key ---
const getApiKeyByUserName = async (userName) => {
  const user = await User.findOne({ user_name: userName });
  if (!user) throw new Error('User not found');
  if (!user.api_key) throw new Error('No API key found for this user');
  return user.api_key;
};

// --- 3. Login User ---
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
  getApiKeyByUserName,
  loginUser
};