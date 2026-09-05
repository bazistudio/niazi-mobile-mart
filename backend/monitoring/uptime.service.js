const os = require('os');

/**
 * UptimeService tracks application and system uptime.
 */
class UptimeService {
  constructor() {
    this.startTime = new Date();
  }

  /**
   * Returns application uptime details
   */
  getAppUptime() {
    const now = new Date();
    const uptimeInSeconds = Math.floor((now - this.startTime) / 1000);
    
    return {
      startTime: this.startTime.toISOString(),
      uptimeSeconds: uptimeInSeconds,
      uptimeHuman: this.formatDuration(uptimeInSeconds),
    };
  }

  /**
   * Returns system level stats
   */
  getSystemStats() {
    return {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      memoryUsage: {
        free: os.freemem(),
        total: os.totalmem(),
        usagePercent: ((1 - os.freemem() / os.totalmem()) * 100).toFixed(2),
      },
      cpuLoad: os.loadavg(),
      cpus: os.cpus().length,
    };
  }

  /**
   * Helper to format seconds into human readable string
   */
  formatDuration(seconds) {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    if (s > 0) parts.push(`${s}s`);

    return parts.join(' ') || '0s';
  }
}

module.exports = new UptimeService();
