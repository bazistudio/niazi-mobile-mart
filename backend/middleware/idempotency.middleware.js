const { idempotencyHandler } = require('../db');
const logger = require('../utils/logger');
const redis = require('../utils/redisClient');

/**
 * Middleware to ensure requests are processed exactly once.
 * Uses the 'Idempotency-Key' header from the client.
 */
const idempotencyMiddleware = async (req, res, next) => {
  // Only apply to state-changing methods
  if (req.method === 'GET' || req.method === 'OPTIONS') {
    return next();
  }

  const idempotencyKey = req.headers['idempotency-key'];

  if (!idempotencyKey) {
    // For a strict ERP, we might enforce this later. For now, if no key, proceed normally.
    // return res.status(400).json({ success: false, message: 'Idempotency-Key header is required' });
    return next();
  }

  try {
    // 1. Check Redis for an atomic lock (prevents parallel identical requests)
    const tenantId = req.user?.tenantId || req.tenantId || 'global';
    const redisLockKey = `idempotency_lock:${tenantId}:${idempotencyKey}`;
    const acquiredLock = await redis.set(redisLockKey, 'locked', 'EX', 300, 'NX');
    
    if (!acquiredLock) {
      // Lock exists, meaning another request is currently processing this key
      return res.status(409).json({ success: false, message: 'Request already processing' });
    }

    // 2. Check if the request was already processed successfully (from previous completed run)
    const existingRequest = await idempotencyHandler.getProcessedRequest(idempotencyKey, tenantId);
    
    if (existingRequest) {
      // Release lock early since we are done
      await redis.del(redisLockKey);
      logger.info(`Idempotency cache hit. Returning cached response for key: ${idempotencyKey}`);
      return res.status(existingRequest.status).json(existingRequest.response);
    }

    // 2. Wrap res.json to capture and store the successful response payload
    const originalJson = res.json;
    res.json = function (body) {
      // Restore original function to avoid double-calling issues
      res.json = originalJson;

      // Only cache successful or non-server-error responses (e.g. 2xx, 4xx)
      // We don't cache 500s because a retry might actually succeed.
      if (res.statusCode < 500) {
        // Asynchronously save to DB, don't block the response to the client
        idempotencyHandler.saveProcessedRequest({
          key: idempotencyKey,
          method: req.method,
          url: req.originalUrl,
          status: res.statusCode,
          response: body,
          tenantId: req.user?.tenantId || req.tenantId,
          userId: req.user?._id
        }).catch(err => {
          logger.error('Failed to save idempotency record', { error: err.message, key: idempotencyKey });
        });
      }

      // Send actual response
      return originalJson.call(this, body);
    };

    // Ensure lock is released when the request finishes
    res.on('finish', () => {
      redis.del(redisLockKey).catch(err => {
        logger.error('Failed to delete idempotency lock', { error: err.message, key: idempotencyKey });
      });
    });

    next();
  } catch (error) {
    logger.error('Idempotency middleware error', { error: error.message });
    next(error);
  }
};

module.exports = idempotencyMiddleware;
