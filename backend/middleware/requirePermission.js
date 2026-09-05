/**
 * Middleware to check if the current user has the required permission
 * based on their resolved permissions in the organization context.
 * 
 * Must be used AFTER organizationContextMiddleware.
 * 
 * @param {string} requiredPermission - The permission flag (e.g. 'PRODUCT_CREATE')
 */
const { ForbiddenError } = require('../utils/errors');

const requirePermission = (requiredPermission) => {
  return (req, res, next) => {
    try {
      // 1. Global Super Admin Bypass
      if (req.user && (req.user.role === 'SUPER_ADMIN' || req.user.isSuperAdmin)) {
        return next();
      }

      // 2. Ensure context exists
      if (!req.permissions || !req.role) {
        return res.status(401).json({ 
          success: false, 
          message: 'Unauthorized: Permission context missing. Did you forget organizationContextMiddleware?' 
        });
      }

      const { role, permissions } = req;
      
      // 2. Global roles bypass (redundant but safe fallback)
      if (['SUPER_ADMIN'].includes(role) || req.orgContext?.isSystemOwner) {
        return next();
      }

      // 3. Evaluate
      if (permissions.includes(requiredPermission)) {
        return next();
      } else {
        throw new ForbiddenError(`Forbidden: Insufficient permissions for this action. Requires ${requiredPermission}.`);
      }

    } catch (error) {
      next(error);
    }
  };
};

module.exports = requirePermission;
