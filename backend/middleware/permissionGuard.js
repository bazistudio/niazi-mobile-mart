const { ROLE_PERMISSIONS } = require("../core/permissions");

/**
 * permissionGuard
 * Enforces specific permission requirements for an API route.
 * 
 * @param {string} requiredPermission - The permission key required (e.g., "stock:adjust")
 * @returns Express Middleware
 */
const permissionGuard = (requiredPermission) => {
  return (req, res, next) => {
    // 1. Check if user is authenticated (should be populated by auth middleware)
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required for this operation",
      });
    }

    const userRole = req.user.role;
    const userPermissions = ROLE_PERMISSIONS[userRole] || [];
    console.log("[permissionGuard] Role:", userRole, "ReqPerm:", requiredPermission);

    // 2. Validate permission
    if (!userPermissions.includes(requiredPermission) && !userPermissions.includes("*")) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: You do not have the required permission [${requiredPermission}]`,
        error: "INSUFFICIENT_PERMISSIONS"
      });
    }

    next();
  };
};

module.exports = permissionGuard;
