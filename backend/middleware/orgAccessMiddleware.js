const OrganizationMember = require('../models/OrganizationMember');
const Branch = require('../models/Branch');
const { DEFAULT_ROLE_PERMISSIONS } = require('../config/permissions');
const { getTenantStore } = require('./context/asyncContext');

/**
 * Middleware to verify if a user has access to a specific organization
 * and optionally a specific shop, validating their permissions.
 * 
 * @param {string[]} requiredPermissions Array of permission keys required (optional)
 */
const orgAccessMiddleware = (requiredPermissions = []) => {
  return async (req, res, next) => {
    try {
      const userId = req.user._id || req.user.userId || req.user.id;
      if (!req.user || !userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized: User context missing' });
      }
      
      let targetOrgId = req.headers['x-organization-id'] || req.body?.organizationId || req.query?.organizationId;
      let targetShopId = req.headers['x-shop-id'] || req.body?.shopId || req.query?.shopId;

      // Handle shop-specific routes (e.g. /api/v1/shops/:id)
      if (req.baseUrl && req.baseUrl.includes('/shops') && req.params?.id) {
        targetShopId = req.params.id;
        const branch = await Branch.findOne({ _id: targetShopId, isDeleted: false });
        if (!branch) {
          return res.status(404).json({ success: false, message: 'Branch not found' });
        }
        targetOrgId = branch.organizationId;
      } else if (req.baseUrl && req.baseUrl.includes('/organizations') && req.params?.id) {
        targetOrgId = req.params.id;
      }

      // Fallback to user session organizationId if not resolved from headers or route
      if (!targetOrgId) {
        targetOrgId = req.organizationId || req.user.organizationId || req.user.tenantId;
      }

      if (!targetOrgId) {
        return res.status(400).json({ success: false, message: 'Organization ID is required' });
      }

      // 1. Fetch Membership
      const membership = await OrganizationMember.findOne({
        organizationId: targetOrgId,
        userId: userId,
        status: 'ACTIVE'
      });

      if (!membership) {
        return res.status(403).json({ success: false, message: 'Forbidden: You are not an active member of this organization' });
      }

      // 2. Resolve permissions
      let resolvedPermissions = [];
      let resolvedRole = membership.role;

      // Base permissions from Org-wide role
      if (membership.isSystemOwner || membership.role === 'OWNER') {
        resolvedPermissions = DEFAULT_ROLE_PERMISSIONS['OWNER'];
      } else {
        // Start with default for role, then merge custom if any
        const basePerms = DEFAULT_ROLE_PERMISSIONS[membership.role] || [];
        const customPerms = membership.permissions || [];
        resolvedPermissions = [...new Set([...basePerms, ...customPerms])];
      }

      // 3. Shop-level override
      if (targetShopId && !membership.isSystemOwner && membership.role !== 'OWNER' && membership.role !== 'ADMIN') {
        const shopAccess = membership.shopAccess && membership.shopAccess.find(s => s.shopId.toString() === targetShopId.toString());
        
        if (shopAccess) {
           resolvedRole = shopAccess.role;
           const shopBasePerms = DEFAULT_ROLE_PERMISSIONS[shopAccess.role] || [];
           const shopCustomPerms = shopAccess.permissions || [];
           // Shop permissions override org permissions completely for this request
           resolvedPermissions = [...new Set([...shopBasePerms, ...shopCustomPerms])];
        } else if (membership.shopAccess && membership.shopAccess.length > 0) {
           // If they have specific shop access defined but this shop isn't one of them, deny
           return res.status(403).json({ success: false, message: 'Forbidden: You do not have access to this specific shop' });
        }
      }

      // 4. Validate required permissions
      if (requiredPermissions.length > 0) {
        const hasAll = requiredPermissions.every(perm => resolvedPermissions.includes(perm));
        if (!hasAll && !membership.isSystemOwner && membership.role !== 'OWNER') {
          return res.status(403).json({ 
            success: false, 
            message: 'Forbidden: Insufficient permissions for this action',
            required: requiredPermissions 
          });
        }
      }

      // 5. Attach resolved context to request
      req.orgContext = {
        organizationId: targetOrgId,
        shopId: targetShopId,
        role: resolvedRole,
        permissions: resolvedPermissions,
        isSystemOwner: membership.isSystemOwner
      };
      
      // Update tenant store for automatic data isolation in models
      const store = getTenantStore();
      if (store) {
        store.organizationId = targetOrgId;
        if (targetShopId) store.shopId = targetShopId;
      }

      next();
    } catch (error) {
      console.error('OrgAccessMiddleware Error:', error);
      res.status(500).json({ success: false, message: 'Internal Server Error validating organization access', details: error.message, stack: error.stack });
    }
  };
};

module.exports = orgAccessMiddleware;
