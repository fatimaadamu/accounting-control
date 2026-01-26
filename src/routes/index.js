const express = require('express');
const router = express.Router();

// Import route modules
const authRoutes = require('./auth');

// Mount routes
router.use('/auth', authRoutes);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ 
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
