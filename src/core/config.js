require('dotenv').config();

/**
 * Central Settings singleton — the only place process.env is read.
 * Every value the service needs lives here; `.env.example` mirrors it.
 */
const Settings = {
  port: parseInt(process.env.PORT, 10) || 3000,
  mongoUri: process.env.MONGO_URI,
  externalApiBase: process.env.EXTERNAL_API_BASE || 'https://api-livekit-vyom.indusnettechnologies.com',
  // Opt-in resolver override for hosts whose system DNS cannot resolve the Atlas SRV record
  // (seen on WSL). Unset means the system resolver, which private/VPC deploys depend on.
  dnsServers: (process.env.DNS_SERVERS || '').split(',').map((s) => s.trim()).filter(Boolean),
};

module.exports = Settings;
