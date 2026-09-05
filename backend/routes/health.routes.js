const express = require("express");
const router = express.Router();
const healthController = require("../monitoring/health.controller");

/**
 * @route   GET /health
 * @desc    System health check (DB, Redis, Queue, API)
 * @access  Public (for monitoring tools)
 */
router.get("/", (req, res) => healthController.getFullHealth(req, res));

module.exports = router;
