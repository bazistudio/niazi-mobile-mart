const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const tenant = require("../middleware/tenant.middleware");
const permissionGuard = require("../middleware/permissionGuard");
const idempotencyMiddleware = require("../middleware/idempotency.middleware");
const { PERMISSIONS } = require("../core/permissions");
const { createOrder, getOrders, getOrderById, updateOrderStatus } = require("../controllers/orderController");

router.post("/", auth, tenant, permissionGuard(PERMISSIONS.ORDER_CREATE), idempotencyMiddleware, createOrder);
router.get("/", auth, tenant, permissionGuard(PERMISSIONS.ORDER_READ), getOrders);
router.get("/:id", auth, tenant, permissionGuard(PERMISSIONS.ORDER_READ), getOrderById);
router.patch("/:id/status", auth, tenant, permissionGuard(PERMISSIONS.ORDER_CREATE), updateOrderStatus); // Reusing ORDER_CREATE or we could use an ORDER_UPDATE if it exists

module.exports = router;
