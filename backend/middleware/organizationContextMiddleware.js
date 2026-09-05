const OrganizationMember = require('../models/OrganizationMember');
const cacheService = require('../services/cacheService');
const permissionResolver = require('../services/permissionResolver');
const User = require('../models/User');
const { getTenantStore } = require('./context/asyncContext');

/**
 * Middleware to verify if a user has access to a specific organization
 * based on their server-side active context, validating their permissions.
 * 
 * @param {string[]} requiredPermissions Array of permission keys required (optional)
 */
const organizationContextMiddleware = (requiredPermissions = []) => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user._id) {
        return res.status(401).json({ success: false, message: 'Unauthorized: User context missing' });
      }

      const userId = req.user._id;
      const organizationId = req.organizationId;
      const shopId = req.shopId;

      if (!organizationId) {
        return res.status(400).json({ success: false, message: 'No active organization context found. Please select an organization.' });
      }

      // 1. Fetch Membership via CacheService with standard key
      const membershipCacheKey = `membership:${organizationId}:${userId}`;
      let membership = await cacheService.remember(membershipCacheKey, 300, async () => {
        return await OrganizationMember.findOne({
          organizationId: organizationId,
          userId: userId,
          status: 'ACTIVE'
        }).lean();
      });

      if (!membership) {
        // Fallback for legacy users who do not have an OrganizationMember document yet
        // We must run this in the system context to bypass the tenant isolation plugin
        // because legacy users have `tenantId` set but `organizationId` may be null.
        const { runInSystemContext } = require('./context/asyncContext');
        const legacyUser = await runInSystemContext(async () => {
          return await User.findById(userId).lean();
        });

        if (legacyUser && 
            (legacyUser.tenantId?.toString() === organizationId.toString() || 
             legacyUser.organizationId?.toString() === organizationId.toString())) {
          membership = {
            _id: `legacy-${userId}`,
            organizationId: organizationId,
            userId: userId,
            role: legacyUser.role === 'SUPER_ADMIN' ? 'OWNER' : (legacyUser.role === 'SHOP_ADMIN' ? 'OWNER' : 'CASHIER'),
            status: 'ACTIVE',
            isSystemOwner: legacyUser.role === 'SUPER_ADMIN'
          };
        } else {
          return res.status(403).json({ success: false, message: 'Forbidden: You are not an active member of this organization' });
        }
      }

      // 2. Resolve permissions using PermissionResolver via CacheService
      const permissionCacheKey = `permission:${membership._id}:${shopId || 'all'}`;
      let resolvedContext;
      try {
        resolvedContext = await cacheService.remember(permissionCacheKey, 300, async () => {
          return permissionResolver.resolvePermissions(membership, shopId);
        });
      } catch (err) {
        return res.status(err.statusCode || 403).json({ success: false, message: err.message });
      }

      const { identity, authorization } = resolvedContext;
      const role = identity.role;
      const permissions = authorization.permissions;

      // 3. Validate required permissions
      if (requiredPermissions.length > 0) {
        const hasAll = requiredPermissions.every(perm => permissions.includes(perm));
        if (!hasAll && !identity.isSystemOwner && role !== 'OWNER') {
          return res.status(403).json({ 
            success: false, 
            message: 'Forbidden: Insufficient permissions for this action',
            required: requiredPermissions 
          });
        }
      }

      // 4. Attach resolved context to request directly
      req.role = role;
      req.permissions = permissions;
      
      // Keep legacy object just in case any in-flight code still uses it
      req.orgContext = {
        organizationId: organizationId,
        shopId: shopId,
        role: role,
        permissions: permissions,
        isSystemOwner: identity.isSystemOwner
      };

      next();
    } catch (error) {
      console.error('OrganizationContextMiddleware Error:', error);
      res.status(500).json({ success: false, message: 'Internal Server Error validating organization access' });
    }
  };
};

module.exports = organizationContextMiddleware;
