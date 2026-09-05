const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/auth');
const { getCurrentTheme, updateTheme } = require('../controllers/theme.controller');

// All theme routes require authentication
router.use(requireAuth);

/**
 * GET  /api/v1/theme/current  → Fetch resolved theme (org or branch, handled by service)
 * PATCH /api/v1/theme          → Update theme colors/mode for current organization
 */
router.get('/current', getCurrentTheme);
router.patch('/', updateTheme);

module.exports = router;
