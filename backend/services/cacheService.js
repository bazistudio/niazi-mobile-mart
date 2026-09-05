const NodeCache = require('node-cache');
let redisClient = null;

// Initialize NodeCache with standard 5 minute TTL (300s), checking for expired keys every 60s
const localCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

/**
 * CacheService abstracts caching logic.
 * It uses NodeCache in development or if Redis is not configured.
 * If process.env.REDIS_URL is provided, it can be extended to use Redis.
 */
class CacheService {
  constructor() {
    this.useRedis = false;
    
    // Future enhancement: Initialize Redis if process.env.REDIS_URL exists
    // if (process.env.REDIS_URL) {
    //   const redis = require('redis');
    //   redisClient = redis.createClient({ url: process.env.REDIS_URL });
    //   redisClient.connect().then(() => {
    //     this.useRedis = true;
    //     console.log('[CACHE] Connected to Redis');
    //   }).catch(console.error);
    // }
  }

  /**
   * Get value from cache
   * @param {string} key 
   * @returns {Promise<any>}
   */
  async get(key) {
    if (this.useRedis && redisClient) {
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    }
    return localCache.get(key);
  }

  /**
   * Set value in cache
   * @param {string} key 
   * @param {any} value 
   * @param {number} ttl Seconds to live (default 300)
   * @returns {Promise<boolean>}
   */
  async set(key, value, ttl = 300) {
    if (this.useRedis && redisClient) {
      await redisClient.set(key, JSON.stringify(value), { EX: ttl });
      return true;
    }
    return localCache.set(key, value, ttl);
  }

  /**
   * Delete key from cache
   * @param {string} key 
   * @returns {Promise<number>}
   */
  async del(key) {
    if (this.useRedis && redisClient) {
      return await redisClient.del(key);
    }
    return localCache.del(key);
  }

  /**
   * Transparently fetch from cache, or evaluate the fallback function, store it, and return.
   * @param {string} key 
   * @param {number} ttl 
   * @param {Function} fetcher Async function that returns the data if cache misses
   */
  async remember(key, ttl, fetcher) {
    const cached = await this.get(key);
    if (cached !== undefined && cached !== null) return cached;
    
    const freshData = await fetcher();
    if (freshData !== undefined && freshData !== null) {
      await this.set(key, freshData, ttl);
    }
    return freshData;
  }

  /**
   * Invalidate all keys matching a specific pattern.
   * @param {string} pattern Regex or wildcard string (for node-cache we will use basic startsWith/includes)
   */
  async invalidatePattern(pattern) {
    if (this.useRedis && redisClient) {
      // Redis pattern scanning (requires SCAN in a real impl, simplistic approach for now)
      const keys = await redisClient.keys(`*${pattern}*`);
      if (keys.length > 0) {
        await redisClient.del(keys);
      }
      return;
    }
    
    // NodeCache approach
    const allKeys = localCache.keys();
    const keysToDelete = allKeys.filter(k => k.includes(pattern));
    if (keysToDelete.length > 0) {
      localCache.del(keysToDelete);
    }
  }
}

module.exports = new CacheService();
