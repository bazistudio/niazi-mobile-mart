const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const tenant = require("../middleware/tenant.middleware");
const permissionGuard = require("../middleware/permissionGuard");
const { PERMISSIONS } = require("../core/permissions");

const {
  receiveStock,
  adjustStock,
  logDamage,
  transferStock,
  manualImport
} = require("../controllers/inventoryController");

// Receive Stock / Purchase (Requires PRODUCT_CREATE permission or dedicated PURCHASING permission)
router.post("/receipts", auth, tenant, permissionGuard(PERMISSIONS.PRODUCT_CREATE), receiveStock);

// Manual Bulk Import
router.post("/manual-import", auth, tenant, permissionGuard(PERMISSIONS.PRODUCT_CREATE), manualImport);

// Stock Adjustment (Requires STOCK_ADJUST permission)
router.post("/adjust", auth, tenant, permissionGuard(PERMISSIONS.STOCK_ADJUST), adjustStock);

// Damage Tracking (Requires STOCK_DAMAGE permission)
router.post("/damage", auth, tenant, permissionGuard(PERMISSIONS.STOCK_DAMAGE), logDamage);

// Branch Transfers (Requires STOCK_TRANSFER permission)
router.post("/transfer", auth, tenant, permissionGuard(PERMISSIONS.STOCK_TRANSFER), transferStock);

module.exports = router;
