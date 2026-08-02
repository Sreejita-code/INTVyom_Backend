/**
 * Wrap an async route handler so a rejected promise is forwarded to the
 * central error handler via next(err) — no per-route try/catch needed.
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
