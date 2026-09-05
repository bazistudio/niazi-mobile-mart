const express = require('express');
const router = express.Router();
const auditLogController = require('../controllers/auditLogController');
const auth = require('../middleware/auth');
const orgAccessMiddleware = require('../middleware/orgAccessMiddleware');

// Get audit logs - requires org-wide view or setting permission, usually for Admins
router.get(
  '/',
  auth,
  orgAccessMiddleware(['org.settings.manage']), 
  auditLogController.getAuditLogs
);

module.exports = router;
