const mongoose = require('mongoose');
const { getLogger } = require('../logging/logger');

const logger = getLogger('db');

/**
 * Open the MongoDB connection using the configured MONGO_URI.
 * Fails fast (exits the process) when the database is unreachable —
 * the service is useless without it.
 */
const connectDB = async () => {
  try {
    const { mongoUri } = require('../config');
    await mongoose.connect(mongoUri);
    logger.info('MongoDB connected');
  } catch (err) {
    logger.error(`Database connection error: ${err.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
