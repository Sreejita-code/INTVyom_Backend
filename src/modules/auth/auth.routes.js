const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');

// --- 1. Signup Route (Existing) ---
router.post('/signup', authController.signup);

// --- 2. Get API Key Route (Existing) ---
// This handles GET requests like: /api/auth/get_api?user_name=John Doe
router.get('/get_api', authController.getApiKey);

// --- 3. Login Route (New) ---
// This handles POST requests with { user_name, password }
router.post('/login', authController.login);

module.exports = router;