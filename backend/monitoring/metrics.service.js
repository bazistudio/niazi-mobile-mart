/**
 * MetricsService collects basic performance and request metrics.
 * Note: For production-grade metrics, consider migrating to prom-client.
 */
class MetricsService {
  constructor() {
    this.requestCounts = {
      total: 0,
      success: 0,
      error: 0,
    };
    this.routeStats = {};
    this.startTime = Date.now();
  }

  /**
   * Records a request completion
   * @param {string} method - HTTP Method
   * @param {string} route - Route path
   * @param {number} statusCode - HTTP Status code
   * @param {number} responseTime - Response time in ms
   */
  recordRequest(method, route, statusCode, responseTime) {
    this.requestCounts.total++;
    
    if (statusCode >= 400) {
      this.requestCounts.error++;
    } else {
      this.requestCounts.success++;
    }

    const routeKey = `${method} ${route}`;
    if (!this.routeStats[routeKey]) {
      this.routeStats[routeKey] = {
        calls: 0,
        errors: 0,
        avgResponseTime: 0,
      };
    }

    const stats = this.routeStats[routeKey];
    stats.calls++;
    if (statusCode >= 400) stats.errors++;
    
    // Simple moving average for response time
    stats.avgResponseTime = (stats.avgResponseTime * (stats.calls - 1) + responseTime) / stats.calls;
  }

  /**
   * Returns summary of collected metrics
   */
  getMetricsSummary() {
    return {
      global: this.requestCounts,
      routes: this.routeStats,
      activeSince: new Date(this.startTime).toISOString(),
    };
  }

  /**
   * Middleware to automatically track requests
   */
  getMiddleware() {
    return (req, res, next) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - start;
        const route = req.route ? req.route.path : req.path;
        this.recordRequest(req.method, route, res.statusCode, duration);
      });

      next();
    };
  }
}

module.exports = new MetricsService();
