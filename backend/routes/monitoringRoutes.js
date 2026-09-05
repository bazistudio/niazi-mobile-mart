const express = require('express');
const router = express.Router();
const healthController = require('../monitoring/health.controller');
const metricsService = require('../monitoring/metrics.service');

// All monitoring routes should ideally be protected in production
// But for now, we'll keep them open for the health check system

// Middleware to track all requests entering the system is usually applied globally in server.js
// However, we can also apply it here if we want metrics only for these routes, 
// but we want them global.

router.get('/live', (req, res) => healthController.getLiveness(req, res));
router.get('/ready', (req, res) => healthController.getReadiness(req, res));
router.get('/report', (req, res) => healthController.getReport(req, res));

module.exports = router;
