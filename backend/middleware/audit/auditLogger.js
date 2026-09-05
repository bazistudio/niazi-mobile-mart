const AuditLog = require("../../models/AuditLog");

/**
 * Lightweight audit logging middleware.
 * Only logs meaningful mutations (CREATE, UPDATE, DELETE) or critical actions (LOGIN, SWITCH_SHOP).
 * Skips GET requests to avoid DB bloat.
 */
const auditLogger = (actionName) => {
  return async (req, res, next) => {
    // Fire and forget, don't await so we don't slow down the response
    res.on('finish', () => {
      // Only log successful or specifically important failed requests
      if (res.statusCode >= 200 && res.statusCode < 400 || res.statusCode >= 500) {
        try {
          // If no specific action name provided, infer from HTTP method
          let action = actionName;
          if (!action) {
            if (req.method === 'POST') action = 'CREATE';
            else if (req.method === 'PUT' || req.method === 'PATCH') action = 'UPDATE';
            else if (req.method === 'DELETE') action = 'DELETE';
            else return; // Skip GET/OPTIONS
          }

          const logEntry = new AuditLog({
            userId: req.user ? req.user._id : null,
            organizationId: req.context ? req.context.organizationId : null,
            shopId: req.context ? req.context.activeShopId : null,
            tenantId: req.user ? req.user.tenantId : null, // Legacy fallback
            action: action,
            resource: req.originalUrl,
            severity: res.statusCode >= 500 ? "CRITICAL" : "INFO",
            ipAddress: req.ip || req.connection.remoteAddress,
            metadata: {
              method: req.method,
              statusCode: res.statusCode,
            }
          });

          logEntry.save().catch(err => console.error("Async AuditLog save failed:", err));
        } catch (error) {
          console.error("Audit Logger Error:", error);
        }
      }
    });

    next();
  };
};

module.exports = auditLogger;
