const Integration = require('./integration.model');
const User = require('../auth/user.model');

// --- 1. Store API Key ---
const storeApiKey = async (data) => {
  const { user_id, service_type, service_name, api_key } = data;

  // Validate User
  const user = await User.findById(user_id);
  if (!user) throw new Error('User not found');

  const normalizedServiceName = service_name.toLowerCase();
  const normalizedServiceType = service_type
    ? service_type.toUpperCase()
    : (normalizedServiceName === 'gemini' ? 'LLM' : 'TTS');

  // We use findOneAndUpdate with upsert: true. 
  // If a key for this user + service_name exists, it updates it. If not, it creates it.
  const integration = await Integration.findOneAndUpdate(
    { 
      user_id: user._id, 
      service_name: normalizedServiceName 
    },
    { 
      $set: { 
        service_type: normalizedServiceType, 
        api_key: api_key 
      } 
    },
    { 
      new: true, // Return the updated document
      upsert: true, // Create if it doesn't exist
      setDefaultsOnInsert: true 
    }
  );

  return integration;
};

// --- 2. Get API Key ---
const getApiKey = async (userId, serviceName) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const integration = await Integration.findOne({
    user_id: user._id,
    service_name: serviceName.toLowerCase()
  });

  if (!integration) {
    throw new Error(`API key for service '${serviceName}' not found for this user`);
  }

  return integration;
};

module.exports = {
  storeApiKey,
  getApiKey
};
