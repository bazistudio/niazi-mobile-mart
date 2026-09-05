// routes/updateRoutes.js
const express = require("express");
const router = express.Router();
const updateController = require("../controllers/updateController");
const { publicApiLimiter } = require("../middleware/rateLimiter");

// Apply public API rate limit to prevent abuse of the update endpoint
router.get("/:filename", publicApiLimiter, updateController.getUpdateAsset);

module.exports = router;
