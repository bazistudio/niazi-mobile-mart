const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const tenant = require("../middleware/tenant.middleware");
const upload = require("../utils/upload");
const { uploadPDF, commitPDFImport } = require("../controllers/importController");

// Secure all import endpoints with JWT authentication and multi-tenant isolation
router.use(auth);
router.use(tenant);

// POST /api/import/upload
router.post("/upload", upload.single("file"), uploadPDF);

// POST /api/import/commit
router.post("/commit", commitPDFImport);

module.exports = router;
