require('dotenv').config();
const express = require('express');
const cors = require('cors'); // 1. Import cors
const connectDB = require('./config/db');
const authRoutes = require('./modules/auth/auth.routes');
const assistantRoutes = require('./modules/assistant/assistant.routes');
const sipRoutes = require('./modules/sip/sip.routes');
const callRoutes = require('./modules/call/call.routes');
const integrationRoutes = require('./modules/integration/integration.routes');

const app = express();

// Middleware
app.use(cors()); // 2. Enable CORS for all origins
app.use(express.json()); 

// Connect to Database
connectDB();

// Mount Modules
app.use('/api/auth', authRoutes);
app.use('/api/assistant', assistantRoutes);
app.use('/api/sip', sipRoutes);
app.use('/api/call', callRoutes);
app.use('/api/integration', integrationRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});