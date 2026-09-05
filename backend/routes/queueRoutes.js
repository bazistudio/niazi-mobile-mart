const express = require('express');
const router = express.Router();
const queueController = require('../controllers/queueController');
const requireAuth = require('../middleware/requireAuth');
const requireSuperAdmin = require('../middleware/requireSuperAdmin'); // Must be superadmin to inspect DLQ

// Admin routes for DLQ inspectability
router.get('/dlq', requireAuth, requireSuperAdmin, queueController.getFailedJobs);
router.post('/dlq/:id/retry', requireAuth, requireSuperAdmin, queueController.retryJob);

module.exports = router;
