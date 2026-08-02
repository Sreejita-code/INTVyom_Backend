/**
 * 404 fallback for unmatched routes — registered after all route mounts.
 */
const notFound = (req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
};

module.exports = notFound;
