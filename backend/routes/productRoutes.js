const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const organizationContextMiddleware = require("../middleware/organizationContextMiddleware");
const upload = require("../middleware/uploadMiddleware");
const { PERMISSIONS } = require("../core/permissions");



const {
  addProduct,
  getProducts,
  getShopProducts,
  updateProduct,
  deleteProduct,
  searchProducts,
  getLowStockProducts,
  checkDuplicate
} = require("../controllers/productController");

router.post("/add", auth, organizationContextMiddleware([PERMISSIONS.PRODUCT_CREATE]), upload.single("image"), addProduct);
router.post("/", auth, organizationContextMiddleware([PERMISSIONS.PRODUCT_CREATE]), upload.single("image"), addProduct);

router.get("/", auth, organizationContextMiddleware([PERMISSIONS.PRODUCT_VIEW]), getProducts);

router.get("/my-products", auth, organizationContextMiddleware(), getShopProducts);

router.get("/low-stock", auth, organizationContextMiddleware(), getLowStockProducts);

// Duplicate check for PDF import engine (Phase 5)
router.get("/check-duplicate", auth, organizationContextMiddleware(), checkDuplicate);

router.put("/update/:id", auth, organizationContextMiddleware([PERMISSIONS.PRODUCT_EDIT]), upload.single("image"), updateProduct);


router.delete("/delete/:id", auth, organizationContextMiddleware([PERMISSIONS.PRODUCT_DELETE]), deleteProduct);

const { searchLimiter } = require("../middleware/rateLimit.middleware");

router.get("/search", auth, organizationContextMiddleware(), searchLimiter, searchProducts);



module.exports = router;