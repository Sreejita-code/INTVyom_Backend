require('dotenv').config();
const express = require('express');
const connectDB = require('./config/db');
const authRoutes = require('./modules/auth/auth.routes');
const assistantRoutes = require('./modules/assistant/assistant.routes');

const app = express();

// Middleware
app.use(express.json()); // Parse JSON bodies

// Connect to Database
connectDB();

// Mount Modules
// All auth routes will be prefixed with /api/auth (e.g., /api/auth/signup)
app.use('/api/auth', authRoutes);
app.use('/api/assistant', assistantRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});