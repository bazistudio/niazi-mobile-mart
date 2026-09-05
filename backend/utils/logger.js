// utils/logger.js
// Structured logger — drop-in ready for Winston / Pino / Sentry at scale

const isDev = process.env.NODE_ENV !== "production";

const { getContext } = require('../middleware/requestContext');

const formatMessage = (level, message, meta = {}) => {
  const timestamp = new Date().toISOString();
  
  // Auto-inject AsyncLocalStorage context (like requestId)
  const store = getContext();
  if (store) {
    if (store.has('requestId') && !meta.requestId) meta.requestId = store.get('requestId');
    if (store.has('userId') && !meta.userId) meta.userId = store.get('userId');
    if (store.has('tenantId') && !meta.tenantId) meta.tenantId = store.get('tenantId');
  }

  const metaStr = Object.keys(meta).length
    ? ` | ${JSON.stringify(meta)}`
    : "";
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
};

const logger = {
  info: (message, meta) => {
    if (isDev) {
      console.log(formatMessage("info", message, meta));
    }
  },

  warn: (message, meta) => {
    if (isDev) {
      console.warn(formatMessage("warn", message, meta));
    }
  },

  error: (message, meta) => {
    console.error(formatMessage("error", message, meta));
  },

  // Silenced in production
  debug: (message, meta) => {
    if (isDev) {
      console.debug(formatMessage("debug", message, meta));
    }
  },

  // HTTP request logger — pass req anywhere after auth
  request: (req) => {
    logger.info(`${req.method} ${req.originalUrl}`, {
      ip: req.ip,
      user: req.user?._id || "guest",
    });
  },
};

module.exports = logger;
