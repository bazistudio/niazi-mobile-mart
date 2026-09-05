const express = require('express');
const router = express.Router();
const searchController = require('../controllers/searchController');
const requireAuth = require('../middleware/auth');
const tenantMiddleware = require('../middleware/tenant.middleware');
const { apiLimiter } = require('../middleware/rateLimiter');

router.use(requireAuth);
router.use(tenantMiddleware);

router.get('/', apiLimiter, searchController.globalSearch);

module.exports = router;
