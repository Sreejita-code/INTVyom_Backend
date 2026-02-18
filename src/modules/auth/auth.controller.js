const authService = require('./auth.service');

// --- 1. Signup Controller (Existing) ---
const signup = async (req, res) => {
  try {
    const user = await authService.registerUser(req.body);
    
    // Return success response (excluding password)
    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user._id,
        user_name: user.user_name,
        user_email: user.user_email,
        api_key: user.api_key
      }
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// --- 2. Get API Key Controller (Existing) ---
const getApiKey = async (req, res) => {
  try {
    const { user_name } = req.query;

    if (!user_name) {
      return res.status(400).json({ error: 'user_name parameter is required' });
    }

    const apiKey = await authService.getApiKeyByUserName(user_name);

    res.status(200).json({
      user_name: user_name,
      api_key: apiKey
    });

  } catch (error) {
    if (error.message === 'User not found' || error.message === 'No API key found for this user') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
};

// --- 3. Login Controller (New Logic) ---
const login = async (req, res) => {
  try {
    const { user_name, password } = req.body;

    // Validate request body
    if (!user_name || !password) {
      return res.status(400).json({ error: 'Please provide both user_name and password' });
    }

    // Call service to verify credentials
    const user = await authService.loginUser({ user_name, password });

    // Return success response (user details found)
    res.status(200).json({
      message: 'Login successful',
      user: {
        id: user._id,
        user_name: user.user_name,
        user_email: user.user_email,
        api_key: user.api_key
      }
    });

  } catch (error) {
    // Return 401 Unauthorized if credentials fail
    if (error.message === 'Invalid credentials') {
      return res.status(401).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
};

// Export all functions
module.exports = {
  signup,
  getApiKey,
  login
};