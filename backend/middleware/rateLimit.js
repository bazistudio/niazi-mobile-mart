const rateLimit = require("express-rate-limit");

exports.apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: { message: "Too many requests from this IP, please try again after 5 minutes" }
});

exports.otpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 3, 
  message: { message: "Too many OTP requests. Try again later." }
});
