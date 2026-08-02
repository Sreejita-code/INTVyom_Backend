const { getLogger } = require('../logging/logger');

const logger = getLogger('http');

/**
 * Central error handler. Every error path returns the same shape:
 * `{ error: message }` with the mapped status — or the error's own
 * `payload` verbatim when one is attached (analytics forwards the
 * upstream body this way). Handlers must not build error bodies
 * themselves — throw/next(err) and land here.
 *
 * Errors carrying `err.status` (validation, upstream rejections) pass
 * through; anything else is a genuine 500.
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) {
    logger.error(`${req.method} ${req.originalUrl} -> ${err.stack || err.message}`);
  }
  res.status(status).json(err.payload || { error: err.message || 'Internal Server Error' });
};

module.exports = errorHandler;
