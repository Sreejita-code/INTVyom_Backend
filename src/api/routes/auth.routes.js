const express = require('express');
const asyncHandler = require('../../core/middleware/asyncHandler');
const authService = require('../../auth/auth.service');
const { httpError, preserveStatus, mapInvalidCredentials } = require('./common');

const router = express.Router();

// Register user and attempt external key creation.
router.post('/signup', asyncHandler(async (req, res) => {
  const user = await authService.registerUser(req.body || {}).catch(preserveStatus(400));

  // Return success response (excluding password)
  res.status(201).json({
    message: 'User registered successfully',
    user: {
      id: user._id,
      user_name: user.user_name,
      user_email: user.user_email,
      api_key: user.api_key
    }
  });
}));

// There is deliberately no uncredentialed key-lookup endpoint. `POST /login` (password) and
// `POST /signup` are the only ways to obtain an `api_key`; the previous GET /get_api returned
// the tenant's upstream key to anyone who knew a username and has been removed.

// Login with user_name and password.
router.post('/login', asyncHandler(async (req, res) => {
  const { user_name, password } = req.body || {};
  if (!user_name || !password) throw httpError(400, 'Please provide both user_name and password');

  const user = await authService.loginUser({ user_name, password }).catch(mapInvalidCredentials);

  res.status(200).json({
    message: 'Login successful',
    user: {
      id: user._id,
      user_name: user.user_name,
      user_email: user.user_email,
      api_key: user.api_key
    }
  });
}));

module.exports = router;
