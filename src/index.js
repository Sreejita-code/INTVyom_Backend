const createApp = require('./server');
const connectDB = require('./core/db/dbConnect');
const Settings = require('./core/config');
const { getLogger } = require('./core/logging/logger');

const logger = getLogger('main');

/**
 * Production runner: connect the database, then serve the app.
 */
const start = async () => {
  await connectDB();
  const app = createApp();
  app.listen(Settings.port, () => {
    logger.info(`Server running on port ${Settings.port}`);
  });
};

start();
