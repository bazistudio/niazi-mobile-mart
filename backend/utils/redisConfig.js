/**
 * Centralized Redis Configuration for V2
 * Ensures BullMQ, caching, and idempotency all connect using the exact same robust settings.
 */

const getRedisConnectionOptions = () => {
  const redisUrl = process.env.REDIS_URL;

  if (redisUrl) {
    // If deploying to managed services that require TLS (Render, Heroku, Upstash)
    // we must ensure rejectUnauthorized is false to prevent CERT_HAS_EXPIRED crashes.
    const isTls = redisUrl.startsWith('rediss://');
    
    return {
      url: redisUrl,
      ...(isTls && { tls: { rejectUnauthorized: false } }),
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    };
  }

  // Fallback to local host for development
  return {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    }
  };
};

module.exports = {
  getRedisConnectionOptions
};
