const logger = require('../utils/logger');

/**
 * Middleware to track HTTP request duration and log the outcome.
 * Essential for observability in production.
 */
const requestLogger = (req, res, next) => {
  const start = process.hrtime();

  res.on('finish', () => {
    const diff = process.hrtime(start);
    const durationMs = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2);
    
    const meta = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      durationMs: parseFloat(durationMs),
      ip: req.ip,
      userAgent: req.get('user-agent')
    };

    if (res.statusCode >= 500) {
      logger.error(`HTTP ${req.method} ${req.originalUrl} - ${res.statusCode} (${durationMs}ms)`, meta);
    } else if (res.statusCode >= 400) {
      logger.warn(`HTTP ${req.method} ${req.originalUrl} - ${res.statusCode} (${durationMs}ms)`, meta);
    } else {
      logger.info(`HTTP ${req.method} ${req.originalUrl} - ${res.statusCode} (${durationMs}ms)`, meta);
    }
  });

  next();
};

module.exports = requestLogger;
