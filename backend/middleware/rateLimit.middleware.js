const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require("express-rate-limit");

/**
 * Custom Rate Limiter middleware focused on per-user/per-tenant protection.
 */

// ─── Search Rate Limiter (Max 20 searches per minute) ─────────────────────────
exports.searchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  // Use tenantId or userId as the key for rate limiting
  keyGenerator: (req) => {
    return req.user ? req.user.id : (req.tenantId || ipKeyGenerator(req));
  },
  message: {
    success: false,
    message: "Search limit reached. Please wait a moment before searching again.",
  },
});

// ─── AI Analysis Limiter (Protection for token-heavy requests) ────────────────
exports.aiAnalysisLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // 50 AI requests per hour
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user ? req.user.id : ipKeyGenerator(req),
  message: {
    success: false,
    message: "Hourly AI request limit reached.",
  },
});
