const Organization = require("../models/Organization");
const Subscription = require("../models/Subscription");
const Package = require("../models/Package");
const Branch = require('../models/Branch');
const User = require("../models/User");
const Product = require("../models/Product");

class OrganizationLimitService {
  /**
   * Retrieves effective limits and current usage for an organization
   */
  async getEffectiveLimits(organizationId) {
    const org = await Organization.findById(organizationId).lean();
    if (!org) throw new Error("Organization not found");

    let packageLimits = { maxBranches: 1, maxUsers: 1, maxProducts: 100, storageLimit: 1024 };
    
    // Find active or pending subscription
    const subscription = await Subscription.findOne({
      ownerId: organizationId,
      ownerType: 'ORGANIZATION',
      status: { $in: ['ACTIVE', 'PENDING', 'SUSPENDED'] }
    }).setOptions({ skipTenantGuard: true }).populate('packageId').lean();

    if (subscription && subscription.packageId) {
      const pkg = subscription.packageId;
      packageLimits = {
        maxBranches: pkg.maxBranches ?? 1,
        maxUsers: pkg.maxUsers ?? 1,
        maxProducts: pkg.maxProducts ?? 100,
        storageLimit: pkg.storageLimit ?? 1024
      };
    }

    const overrides = org.limitsOverride || {};
    const subLimits = subscription?.limits || {};
    
    // Priority: Subscription Limits -> Organization Override -> Package Default
    const effectiveLimits = {
      maxBranches: subLimits.maxBranches !== undefined && subLimits.maxBranches !== null ? subLimits.maxBranches 
                   : (overrides.maxBranches !== undefined && overrides.maxBranches !== null ? overrides.maxBranches : packageLimits.maxBranches),
                   
      maxUsers: subLimits.maxUsers !== undefined && subLimits.maxUsers !== null ? subLimits.maxUsers 
                : (overrides.maxUsers !== undefined && overrides.maxUsers !== null ? overrides.maxUsers : packageLimits.maxUsers),
                
      maxProducts: subLimits.maxProducts !== undefined && subLimits.maxProducts !== null ? subLimits.maxProducts 
                   : (overrides.maxProducts !== undefined && overrides.maxProducts !== null ? overrides.maxProducts : packageLimits.maxProducts),
                   
      storageLimit: subLimits.storageLimit !== undefined && subLimits.storageLimit !== null ? subLimits.storageLimit 
                    : (overrides.storageLimit !== undefined && overrides.storageLimit !== null ? overrides.storageLimit : packageLimits.storageLimit)
    };

    // Calculate usage (Assuming tenantIsolation plugin uses tenantId for Organization)
    const currentBranches = await Branch.countDocuments({ organizationId, status: { $ne: 'DELETED' } }).setOptions({ skipTenantGuard: true }).catch(() => 0);
    const currentUsers = await User.countDocuments({ organizationId }).setOptions({ skipTenantGuard: true }).catch(() => 0);
    const currentProducts = await Product.countDocuments({ organizationId }).setOptions({ skipTenantGuard: true }).catch(() => 0);

    return {
      limits: effectiveLimits,
      usage: {
        currentBranches,
        currentUsers,
        currentProducts
      },
      remaining: {
        branches: effectiveLimits.maxBranches === 0 ? 'Unlimited' : Math.max(0, effectiveLimits.maxBranches - currentBranches),
        users: effectiveLimits.maxUsers === 0 ? 'Unlimited' : Math.max(0, effectiveLimits.maxUsers - currentUsers),
        products: effectiveLimits.maxProducts === 0 ? 'Unlimited' : Math.max(0, effectiveLimits.maxProducts - currentProducts)
      }
    };
  }
}

module.exports = new OrganizationLimitService();
