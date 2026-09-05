const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const superAdmin = require("../middleware/superAdmin");

const controller = require("../controllers/admin.controller");

router.use(auth);
router.use(superAdmin);

// Audit Logs
router.get("/audit-logs", controller.getAuditLogs);

// Internal User Management & Approval
router.get("/users", controller.getUsers);
router.get("/shop-admins/pending", controller.getPendingShopAdmins);
router.get("/org-admins/pending", controller.getPendingOrgAdmins);
router.patch("/users/:id/approve", controller.approveUser);
router.patch("/users/:id/reject", controller.rejectUser);
router.patch("/users/:id/suspend", controller.suspendUser);

module.exports = router;