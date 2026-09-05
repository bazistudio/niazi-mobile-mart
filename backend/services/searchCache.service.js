const redis = require('redis');
const logger = require('../utils/logger');

/**
 * SearchCacheService handles caching for search queries using Redis.
 * Falls back to direct execution if Redis is unavailable.
 */
class SearchCacheService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.defaultTTL = 3600; // 1 hour in seconds
    
    this.init();
  }

  /**
   * Initialize Redis connection
   */
  async init() {
    try {
      if (!process.env.REDIS_URL && !process.env.REDIS_HOST) {
        logger.info('REDIS_URL not found, disabling Redis caching. Running in fallback mode.');
        this.isConnected = false;
        return;
      }

      const redisUrl = process.env.REDIS_URL;
      
      this.client = redis.createClient({
        url: redisUrl
      });


      this.client.on('error', (err) => {
        logger.error('Redis Client Error', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        logger.info('Redis Client Connected');
        this.isConnected = true;
      });

      await this.client.connect();
    } catch (err) {
      logger.error('Failed to initialize Redis', err);
      this.isConnected = false;
    }
  }

  /**
   * getOrSet: Core caching logic
   * @param {string} key - Cache key
   * @param {Function} fetchFn - Function to fetch data if cache miss
   * @param {number} ttl - Time to live in seconds
   */
  async getOrSet(key, fetchFn, ttl = this.defaultTTL) {
    // 1. If Redis is not connected, just fetch and return
    if (!this.isConnected || !this.client) {
      return await fetchFn();
    }

    try {
      // 2. Check cache
      const cachedData = await this.client.get(key);
      if (cachedData) {
        logger.info(`Cache Hit: ${key}`);
        return JSON.parse(cachedData);
      }

      // 3. Cache Miss -> Fetch
      logger.info(`Cache Miss: ${key}`);
      const data = await fetchFn();

      // 4. Save to cache (async, don't block return)
      if (data) {
        this.client.setEx(key, ttl, JSON.stringify(data))
          .catch(err => logger.error(`Redis set error for key ${key}`, err));
      }

      return data;
    } catch (err) {
      logger.error(`SearchCacheService Error for key ${key}`, err);
      return await fetchFn(); // Fallback to fetching data on cache error
    }
  }

  /**
   * Clear cache for a specific key or pattern (using *)
   */
  async invalidate(pattern) {
    if (!this.isConnected || !this.client) return;

    try {
      if (pattern.includes('*')) {
        let cursor = 0;
        do {
          const reply = await this.client.scan(cursor, {
            MATCH: pattern,
            COUNT: 100
          });
          cursor = reply.cursor;
          const keys = reply.keys;
          if (keys.length > 0) {
            await this.client.del(keys);
          }
        } while (cursor !== 0);
        logger.info(`Invalidated cache pattern: ${pattern}`);
      } else {
        await this.client.del(pattern);
        logger.info(`Invalidated cache key: ${pattern}`);
      }
    } catch (err) {
      logger.error(`Error invalidating cache pattern ${pattern}`, err);
    }
  }
}


module.exports = new SearchCacheService();
