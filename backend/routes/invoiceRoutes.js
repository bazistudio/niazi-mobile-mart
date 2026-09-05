const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');
const requireAuth = require('../middleware/auth');
const tenantMiddleware = require('../middleware/tenant.middleware');
const permissionGuard = require('../middleware/permissionGuard');
const { PERMISSIONS } = require('../core/permissions');

router.use(requireAuth);
router.use(tenantMiddleware);

router.get('/', permissionGuard(PERMISSIONS.FINANCE_VIEW), invoiceController.getInvoices);
router.get('/:id/pdf', permissionGuard(PERMISSIONS.FINANCE_VIEW), invoiceController.downloadInvoicePDF);

module.exports = router;
