const redis = require('../utils/redisClient');
const logger = require('../utils/logger');
const auditService = require('../services/auditService');

// Threshold: Max 1000 requests per tenant per minute
const ABUSE_THRESHOLD = 1000;

/**
 * Tenant Abuse Guard
 * Prevents DDoS or automated scraping at the tenant level using a Redis sliding window.
 */
module.exports = async (req, res, next) => {
  const tenantId = req.tenantId || (req.user && req.user.tenantId);
  
  if (!tenantId) {
    return next(); // Skip if no tenant context (public routes)
  }

  try {
    const bucket = Math.floor(Date.now() / 60000);
    const redisKey = `tenant:${tenantId}:req_count:${bucket}`;

    // Atomic INCR and TTL setting
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.expire(redisKey, 70); // Expire after 70s (safe buffer)
    }

    if (count > ABUSE_THRESHOLD) {
      logger.error(`CRITICAL: API Abuse Detected for Tenant ${tenantId}`, { count });
      
      // Log immutable audit trail if crossing exactly threshold (prevents spamming logs)
      if (count === ABUSE_THRESHOLD + 1) {
        await auditService.logAction({
          userId: req.user ? req.user._id : null,
          tenantId: tenantId,
          action: 'API_ABUSE_DETECTED',
          resource: 'TENANT_API',
          metadata: { reqCount: count, ip: req.ip }
        });
      }

      return res.status(429).json({
        success: false,
        message: 'Too many requests. Temporary tenant restriction applied.'
      });
    }

    next();
  } catch (error) {
    logger.error('Redis Abuse Guard Error', { error: error.message });
    // Fail open if Redis drops so we don't break the system
    next();
  }
};
