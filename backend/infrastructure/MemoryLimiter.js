const RateLimiter = require('../interfaces/RateLimiter');

class MemoryLimiter extends RateLimiter {
  constructor(options = {}) {
    super();
    this.points = options.points || 10;
    this.duration = options.duration || 1; // seconds
    this.store = new Map();
  }

  async consume(key, pointsToConsume = 1) {
    const now = Date.now();
    let record = this.store.get(key);

    if (!record || record.resetTime <= now) {
      record = {
        tokens: this.points,
        resetTime: now + this.duration * 1000
      };
    }

    if (record.tokens < pointsToConsume) {
      throw new Error('Rate limit exceeded');
    }

    record.tokens -= pointsToConsume;
    this.store.set(key, record);
    return record;
  }
}

module.exports = MemoryLimiter;
