const Redis = require('ioredis');
const logger = require('./logger');
const { getRedisConnectionOptions } = require('./redisConfig');

let redisClient;

const useRedis = process.env.REDIS_HOST || process.env.REDIS_URL;

if (useRedis) {
  redisClient = new Redis(getRedisConnectionOptions());

  redisClient.on('error', (err) => {
    logger.error('Redis connection error', { error: err.message });
  });
} else {
  // Graceful fallback mock to prevent connection spam when Redis is disabled
  console.warn("⚠️ Redis disabled, using degraded idempotency mode. Distributed locks are inactive.");
  redisClient = {
    get: async () => null,
    set: async () => 'OK', // Returns OK to prevent 409 Conflict in idempotency middleware
    setex: async () => 'OK',
    del: async () => 1,
    on: () => {},
    quit: async () => null,
  };
  
  // Use a proxy to safely ignore any other method calls without crashing
  redisClient = new Proxy(redisClient, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return async () => null; // default to returning a resolved promise
    }
  });
}

module.exports = redisClient;
