const { AsyncLocalStorage } = require('async_hooks');

const tenantContext = new AsyncLocalStorage();

/**
 * Middleware to initialize tenant context from the request.
 */
function tenantContextMiddleware(req, res, next) {
  // Normally populated via auth middleware
  const store = {
    organizationId: req.organizationId || null,
    shopId: req.shopId || null,
    userId: req.user ? req.user.userId || req.user._id : null,
    sessionId: req.user ? req.user.sessionId : null,
    role: req.role || null,
    requestId: req.requestId || null
  };

  tenantContext.run(store, () => {
    next();
  });
}

function getTenantStore() {
  return tenantContext.getStore() || {};
}

/**
 * Execute a callback in a system-wide platform context.
 * Bypasses TenantGuard completely. Use extremely sparingly for migrations, global background cleanup, etc.
 */
function runInSystemContext(callback) {
  const store = {
    isSystemContext: true,
    actorType: "SYSTEM",
    source: "CRON_OR_MAINTENANCE",
    startedAt: new Date()
  };
  return tenantContext.run(store, callback);
}

/**
 * Execute a callback impersonating a specific organization.
 * Used primarily for running business cron jobs securely, one tenant at a time.
 */
function runAsOrganization(organizationId, metadata = {}, callback) {
  const store = {
    organizationId,
    actorType: metadata.actorType || "SYSTEM",
    source: metadata.source || "CRON",
    jobName: metadata.jobName || "UNKNOWN_JOB",
    requestId: metadata.requestId || require('crypto').randomUUID(),
    startedAt: new Date()
  };
  return tenantContext.run(store, callback);
}

module.exports = {
  tenantContext,
  tenantContextMiddleware,
  getTenantStore,
  runInSystemContext,
  runAsOrganization
};
