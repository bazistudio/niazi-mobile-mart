const RoleMatrix = require('../models/RoleMatrix');

/**
 * Middleware to check if the current user has the required permission
 * based on their role and the shop's custom RoleMatrix.
 * @param {string} requiredPermission - The permission flag (e.g. 'VIEW_LEDGER')
 */
exports.checkPermission = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      // 1. Ensure user is authenticated
      if (!req.user) {
        return res.status(401).json({ message: 'Not authorized, no user found' });
      }

      const role = req.user.role;
      const tenantId = req.user.tenantId || req.tenantId;
      const shopId = req.user.shopId || req.shopId;

      // 2. Global roles skip shop-level matrix checks
      if (['SUPER_ADMIN', 'MULTI_ADMIN', 'OWNER'].includes(role) || req.orgContext?.isSystemOwner) {
        return next();
      }

      // 3. Admin logic: SHOP_ADMIN usually has all permissions within their shop
      // But we still evaluate it against the RoleMatrix if desired, or skip it.
      // For maximum strictness, we require a Matrix entry, but practically SHOP_ADMIN
      // is hardcoded to bypass most checks in basic SaaS. Let's enforce it via Matrix for consistency.
      if (!shopId) {
        return res.status(403).json({ message: 'No shop context found for this user.' });
      }

      // 4. Fetch Effective Permissions from RoleMatrix
      const matrix = await RoleMatrix.findOne({ shopId, tenantId, role });

      if (!matrix) {
        // Fallback: if no matrix exists, deny access to be safe, 
        // unless they are SHOP_ADMIN (which guarantees full access in basic setups)
        if (role === 'SHOP_ADMIN' || role === 'OWNER') {
          return next();
        }
        return res.status(403).json({ 
          message: `Access denied. No permission matrix found for role: ${role}` 
        });
      }

      // 5. Evaluate
      if (matrix.permissions[requiredPermission] === true) {
        return next();
      } else {
        return res.status(403).json({ 
          message: `Access denied. Requires permission: ${requiredPermission}` 
        });
      }

    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({ message: 'Server error during permission check' });
    }
  };
};
