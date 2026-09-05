const express = require("express");
const router = express.Router();

const {
  sendOtp,
  verifyOtp,
} = require("../controllers/otpController");
const { otpLimiter } = require("../middleware/rateLimit");

router.post("/send-otp", otpLimiter, sendOtp);
router.post("/verify-otp", verifyOtp);

module.exports = router;
