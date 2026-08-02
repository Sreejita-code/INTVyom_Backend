/**
 * Minimal console-backed logger. One setup point today; swap transports here
 * without touching call sites. getLogger(moduleName) returns a scoped logger.
 */
const createLogger = (moduleName) => {
  const prefix = moduleName ? `[${moduleName}]` : '';
  return {
    info: (...args) => console.log(prefix, ...args),
    warn: (...args) => console.warn(prefix, ...args),
    error: (...args) => console.error(prefix, ...args),
  };
};

module.exports = { createLogger, getLogger: createLogger };
