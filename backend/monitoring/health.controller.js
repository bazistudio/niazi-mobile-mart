const mongoose = require('mongoose');
const uptimeService = require('./uptime.service');
const metricsService = require('./metrics.service');
const mainQueue = require('../queues/mainQueue');

/**
 * HealthController handles health check and monitoring endpoints.
 */
class HealthController {
  /**
   * Basic Liveness probe
   */
  getLiveness(req, res) {
    res.status(200).json({
      status: 'UP',
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Readiness probe (checks DB connectivity)
   */
  async getReadiness(req, res) {
    const dbState = mongoose.connection.readyState;
    const isDbConnected = dbState === 1; // 1 = connected

    const status = isDbConnected ? 'UP' : 'DOWN';
    const statusCode = isDbConnected ? 200 : 503;

    res.status(statusCode).json({
      status,
      checks: {
        database: isDbConnected ? 'CONNECTED' : 'DISCONNECTED'
      },
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Detailed health and performance report
   */
  getReport(req, res) {
    res.status(200).json({
      status: 'UP',
      uptime: uptimeService.getAppUptime(),
      system: uptimeService.getSystemStats(),
      metrics: metricsService.getMetricsSummary(),
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Comprehensive health check
   */
  async getFullHealth(req, res) {
    try {
      // 1. Database Check
      const dbStatus = mongoose.connection.readyState === 1 ? 'UP' : 'DOWN';

      // 2. Queue & Redis Check
      let queueStatus = 'DOWN';
      let redisStatus = 'DOWN';
      
      try {
        const client = await mainQueue.queue.client;
        const ping = await client.ping();
        if (ping === 'PONG') {
          redisStatus = 'UP';
          queueStatus = 'UP';
        }
      } catch (err) {
        console.error("Health check Redis/Queue error:", err.message);
      }

      // 3. System Stats
      const uptime = uptimeService.getAppUptime();
      const system = uptimeService.getSystemStats();

      const isHealthy = dbStatus === 'UP' && redisStatus === 'UP';

      res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? 'UP' : 'PARTIAL_OUTAGE',
        checks: {
          database: dbStatus,
          redis: redisStatus,
          queue: queueStatus,
        },
        uptime: uptime.uptimeHuman,
        memory: `${system.memoryUsage.usagePercent}%`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        status: 'ERROR',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
}

module.exports = new HealthController();
