const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const path = require('path');
const authRoutes = require('./api/routes/auth.routes');
const assistantRoutes = require('./api/routes/assistant.routes');
const sipRoutes = require('./api/routes/sip.routes');
const callRoutes = require('./api/routes/call.routes');
const integrationRoutes = require('./api/routes/integration.routes');
const toolRoutes = require('./api/routes/tool.routes');
const webCallRoutes = require('./api/routes/webcall.routes');
const inboundRoutes = require('./api/routes/inbound.routes');
const inboundContextStrategyRoutes = require('./api/routes/inbound-context-strategy.routes');
const analyticsRoutes = require('./api/routes/analytics.routes');
const passthroughRoutes = require('./api/routes/passthrough.routes');
const audioRoutes = require('./api/routes/audio.routes');
const errorHandler = require('./core/middleware/errorHandler');
const notFound = require('./core/middleware/notFound');

/**
 * Build and return the Express app — wiring only.
 * Middleware, docs, route mounts and the terminal error handlers live here;
 * business rules live in src/<domain>/, HTTP I/O in src/services/.
 */
const createApp = () => {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Swagger Documentation
  const swaggerDocument = YAML.load(path.join(__dirname, '..', 'swagger.yaml'));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

  // Mount Modules
  app.use('/api/auth', authRoutes);
  app.use('/api/assistant', assistantRoutes);
  app.use('/api/sip', sipRoutes);
  app.use('/api/call', callRoutes);
  app.use('/api/integration', integrationRoutes);
  app.use('/api/tool', toolRoutes);
  app.use('/api/web-call', webCallRoutes);
  app.use('/api/inbound', inboundRoutes);
  app.use('/api/inbound-context-strategy', inboundContextStrategyRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/passthrough-call', passthroughRoutes);
  app.use('/api/audio', audioRoutes);

  // 404 + central error handling — one response shape for every failure.
  app.use(notFound);
  app.use(errorHandler);

  return app;
};

module.exports = createApp;
