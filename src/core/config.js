const dns = require('dns');
require('dotenv').config();
dns.setServers(['8.8.8.8', '1.1.1.1']);

/**
 * Central Settings singleton — the only place process.env is read.
 * Every value the service needs lives here; `.env.example` mirrors it.
 */
const Settings = {
  port: parseInt(process.env.PORT, 10) || 3000,
  mongoUri: process.env.MONGO_URI,
  externalApiBase: process.env.EXTERNAL_API_BASE || 'https://api-livekit-vyom.indusnettechnologies.com',
};

module.exports = Settings;