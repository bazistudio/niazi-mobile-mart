// routes/shop.routes.js

const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const orgAccessMiddleware = require("../middleware/orgAccessMiddleware");
const { PERMISSIONS } = require("../config/permissions");
const validate = require("../middleware/validate");
const {
  createShopRules,
  updateShopRules,
  statusFilterRules,
} = require("../validators/shop.validator");

const {
  createShop,
  getAllShops,
  getShopById,
  getMyShop,
  updateShop,
  toggleShopStatus,
  deleteShop,
} = require("../controllers/shop.controller");

// ─── Admin: View Own Shop ─────────────────────────────────────────────────────
// GET /api/shops/me  — must be before /:id to avoid "me" being treated as an id
router.get("/me", auth, getMyShop);

// ─── SuperAdmin: Full Shop Management ────────────────────────────────────────

// POST   /api/shops          → Create shop
router.post(
  "/",
  auth,
  orgAccessMiddleware([PERMISSIONS.SHOPS_MANAGE]),
  createShopRules,
  validate,
  createShop
);

// GET    /api/shops           → List all shops (?status=active)
router.get(
  "/",
  auth,
  orgAccessMiddleware([PERMISSIONS.SHOPS_VIEW_ALL]),
  statusFilterRules,
  validate,
  getAllShops
);

// GET    /api/shops/:id       → Get single shop
router.get(
  "/:id",
  auth,
  orgAccessMiddleware([PERMISSIONS.SHOPS_VIEW_ALL]),
  getShopById
);

// PATCH  /api/shops/:id              → Update shop details
router.patch(
  "/:id",
  auth,
  orgAccessMiddleware([PERMISSIONS.SHOPS_MANAGE]),
  updateShopRules,
  validate,
  updateShop
);

// PATCH  /api/shops/:id/status       → Change status (active/suspended/inactive)
router.patch(
  "/:id/status",
  auth,
  orgAccessMiddleware([PERMISSIONS.SHOPS_MANAGE]),
  toggleShopStatus
);

// DELETE /api/shops/:id              → Soft delete
router.delete(
  "/:id",
  auth,
  orgAccessMiddleware([PERMISSIONS.SHOPS_MANAGE]),
  deleteShop
);

module.exports = router;
