/**
 * Route-level error-status helpers. Each endpoint keeps its historical status
 * semantics while delegating the error BODY to the central error handler.
 */

// Force every rejection from a service call to one status (legacy behavior,
// e.g. "create endpoints always surfaced failures as 400").
const preserveStatus = (status) => (error) => {
  error.status = status;
  throw error;
};

// "not found" in the message → 404, anything else → 500 (legacy webcall/passthrough behavior).
const mapNotFoundTo404 = (error) => {
  error.status = error.message.includes('not found') ? 404 : 500;
  throw error;
};

// 'Invalid credentials' → 401, anything else → 500 (legacy login behavior).
const mapInvalidCredentials = (error) => {
  error.status = error.message === 'Invalid credentials' ? 401 : 500;
  throw error;
};

// Build a status-carrying error for a failed validation check.
const httpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

module.exports = { preserveStatus, mapNotFoundTo404, mapInvalidCredentials, httpError };
