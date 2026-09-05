/**
 * Tenant Middleware
 * Final Production Pattern: Derive from authenticated user (req.user).
 * JWT -> user -> tenantId -> req.tenantId
 */
module.exports = (req, res, next) => {
  const user = req.user;
  const { tenantContext } = require('./context/asyncContext');

  // Super Admins can bypass the strict tenant requirement
  if (user && user.role === "SUPER_ADMIN") {
    // If they aren't impersonating a tenant, assign a dummy valid ID
    // so that queries don't crash the global tenantGuard.
    req.tenantId = req.headers["x-tenant-id"] || user.tenantId || "00000000-0000-0000-0000-000000000000";
    req.organizationId = req.tenantId;

    const store = {
      organizationId: req.organizationId,
      userId: user._id
    };

    return tenantContext.run(store, () => {
      next();
    });
  }

  const contextId = req.organizationId || req.tenantId || user.tenantId || user.organizationId;
  
  if (!user || !contextId) {
    return res.status(401).json({
      success: false,
      message: "Multi-tenant context missing: Authenticated user must have an assigned tenantId or organizationId.",
    });
  }

  // Attach to request object for use in core controllers
  req.tenantId = contextId;
  req.organizationId = contextId;

  // The context is already initialized by auth.js for normal users,
  // but to be absolutely safe and guarantee consistency, we re-run it here.
  const store = {
    organizationId: contextId,
    userId: user._id
  };

  tenantContext.run(store, () => {
    next();
  });
};
