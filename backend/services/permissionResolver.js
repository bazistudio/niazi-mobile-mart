const { DEFAULT_ROLE_PERMISSIONS } = require('../config/permissions');
const { ForbiddenError, ValidationError } = require('../utils/errors');

/**
 * Service to resolve a user's role and permissions securely, accounting for
 * organization roles, system owner privileges, and specific shop overrides.
 */
class PermissionResolver {
  /**
   * Resolves the effective role and permissions for a given membership and optional target shop.
   * 
   * @param {Object} membership The OrganizationMember document for this user in this organization
   * @param {string} targetShopId The specific shop being accessed (optional)
   * @returns {Object} Structured identity and context payload
   */
  resolvePermissions(membership, targetShopId) {
    if (!membership || membership.status !== 'ACTIVE') {
      throw new ForbiddenError('Invalid or inactive membership');
    }

    let resolvedRole = membership.role;
    let resolvedPermissions = [];

    // 1. System Owner / Org Owner Bypass
    if (membership.isSystemOwner || membership.role === 'OWNER') {
      resolvedPermissions = DEFAULT_ROLE_PERMISSIONS['OWNER'] || [];
      return {
        identity: {
          role: 'OWNER',
          isOwner: true,
          isSystemOwner: membership.isSystemOwner || false
        },
        context: {
          organizationId: membership.organizationId,
          shopId: targetShopId || null
        },
        authorization: {
          permissions: resolvedPermissions,
          shopAccess: membership.shopAccess || []
        }
      };
    }

    // 2. Base Organization Permissions
    const basePerms = DEFAULT_ROLE_PERMISSIONS[membership.role] || [];
    const customPerms = membership.permissions || [];
    resolvedPermissions = [...new Set([...basePerms, ...customPerms])];

    // 3. Shop-Level Override
    if (targetShopId && membership.role !== 'ADMIN') {
      const shopAccess = membership.shopAccess && membership.shopAccess.find(s => s.shopId.toString() === targetShopId.toString());
      
      if (shopAccess) {
        resolvedRole = shopAccess.role;
        const shopBasePerms = DEFAULT_ROLE_PERMISSIONS[shopAccess.role] || [];
        const shopCustomPerms = shopAccess.permissions || [];
        resolvedPermissions = [...new Set([...shopBasePerms, ...shopCustomPerms])];
      } else if (membership.shopAccess && membership.shopAccess.length > 0) {
        throw new ForbiddenError('Forbidden: You do not have access to this specific shop');
      }
    }

    return {
      identity: {
        role: resolvedRole,
        isOwner: resolvedRole === 'OWNER',
        isSystemOwner: membership.isSystemOwner || false
      },
      context: {
        organizationId: membership.organizationId,
        shopId: targetShopId || null
      },
      authorization: {
        permissions: resolvedPermissions,
        shopAccess: membership.shopAccess || []
      }
    };
  }
}

module.exports = new PermissionResolver();
