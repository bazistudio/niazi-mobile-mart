// middleware/rateLimiter.js
const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");
const { errorResponse } = require("../utils/apiResponse");

const createLimiter = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // If logged in, rate limit by user/session instead of just IP
    if (req.user && req.user.sessionId) return `session:${req.user.sessionId}`;
    if (req.user && req.user._id) return `user:${req.user._id}`;
    return ipKeyGenerator(req);
  },
  handler: (req, res) => {
    errorResponse(res, message, [], 429);
  }
});

// Authentication
exports.loginLimiter = createLimiter(15 * 60 * 1000, 10, "Too many login attempts. Please wait 15 minutes.");
exports.pinLimiter = createLimiter(5 * 60 * 1000, 5, "Too many PIN attempts. Please wait 5 minutes.");
exports.refreshLimiter = createLimiter(60 * 1000, 20, "Too many token refresh requests. Please wait.");

// Context Switching
exports.switchContextLimiter = createLimiter(60 * 1000, 30, "Too many context switches. Please slow down.");

// Read Heavy
exports.searchLimiter = createLimiter(60 * 1000, 60, "Too many search requests. Please slow down.");
exports.reportLimiter = createLimiter(5 * 60 * 1000, 20, "Too many report generations. Please wait 5 minutes.");

// CPU/IO Heavy
exports.exportLimiter = createLimiter(15 * 60 * 1000, 10, "Too many export requests. Please wait 15 minutes.");

// General API
exports.apiLimiter = createLimiter(60 * 1000, 100, "Too many requests. Please wait.");
exports.publicApiLimiter = createLimiter(15 * 60 * 1000, 100, "Too many public API requests.");
exports.internalApiLimiter = createLimiter(60 * 1000, 300, "Too many internal API requests.");
