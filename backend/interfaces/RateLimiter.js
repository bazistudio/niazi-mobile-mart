class RateLimiter {
  async consume(key, points = 1) {
    throw new Error('Method not implemented.');
  }
}

module.exports = RateLimiter;
