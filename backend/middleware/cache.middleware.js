const redis = require('../utils/redisClient');
const logger = require('../utils/logger');

/**
 * Express middleware to cache responses in Redis.
 * @param {number} ttlSeconds - Time to live in seconds
 */
const cacheMiddleware = (ttlSeconds = 60) => {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') return next();

    // Generate a unique cache key based on URL and Tenant context
    const tenantId = req.tenantId || (req.user && req.user.tenantId) || 'global';
    const key = `cache:${tenantId}:${req.originalUrl || req.url}`;

    try {
      const cachedData = await redis.get(key);
      if (cachedData) {
        return res.json(JSON.parse(cachedData));
      }

      // Intercept the res.json to save it to cache before sending
      const originalJson = res.json;
      res.json = function (data) {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          redis.set(key, JSON.stringify(data), 'EX', ttlSeconds).catch(err => {
            logger.error('Redis cache set error', { error: err.message, key });
          });
        }
        return originalJson.call(this, data);
      };

      next();
    } catch (error) {
      logger.error('Redis cache get error', { error: error.message, key });
      next(); // Fail open
    }
  };
};

/**
 * Helper to explicitly invalidate cache for a tenant
 * @param {string} tenantId 
 * @param {string} prefix - The URL prefix to clear (e.g., '/api/dashboard')
 */
const invalidateCache = async (tenantId, prefix = '') => {
  try {
    const pattern = `cache:${tenantId}:${prefix}*`;
    let cursor = '0';
    const keys = [];

    do {
      const [nextCursor, foundKeys] = await redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100
      );
      
      cursor = nextCursor;
      keys.push(...foundKeys);
    } while (cursor !== '0');

    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    logger.error('Redis cache invalidation error', { error: error.message });
  }
};

module.exports = { cacheMiddleware, invalidateCache, redisClient: redis };
