const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const requireAuth = require('../middleware/auth');
const { cacheMiddleware } = require('../middleware/cache.middleware');

router.use(requireAuth);

// Cache read-heavy dashboard endpoints for 60 seconds
router.get('/metrics', cacheMiddleware(60), dashboardController.getMetrics);
router.get('/hourly-breakdown', cacheMiddleware(30), dashboardController.getHourlyBreakdown);
router.get('/sales-chart', cacheMiddleware(60), dashboardController.getSalesChart);
router.get('/summary', cacheMiddleware(60), dashboardController.getSummary);
router.get('/revenue', dashboardController.getRevenue);
router.get('/sales', dashboardController.getSales);
router.get('/orders', dashboardController.getOrders);
router.get('/stock-alerts', dashboardController.getStockAlerts);
router.get('/activity-feed', dashboardController.getActivityFeed);
router.get('/activities', dashboardController.getActivityFeed);

module.exports = router;
