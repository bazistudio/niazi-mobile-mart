const OrganizationFeature = require('../models/OrganizationFeature');
const cacheService = require('../services/cacheService');
const { ForbiddenError } = require('../utils/errors');

/**
 * Middleware to check if an organization has a specific feature enabled.
 * Should run after organizationContextMiddleware.
 * 
 * @param {string} featureName - The feature required (e.g. 'POS', 'INVENTORY')
 */
const requireFeature = (featureName) => {
  return async (req, res, next) => {
    try {
      const organizationId = req.organizationId || (req.orgContext && req.orgContext.organizationId);

      if (!organizationId) {
        return res.status(401).json({ 
          success: false, 
          message: 'Unauthorized: No organization context found' 
        });
      }

      // Check cache first
      const cacheKey = `feature:${organizationId}:${featureName.toUpperCase()}`;
      
      const hasFeature = await cacheService.remember(cacheKey, 600, async () => {
        const feature = await OrganizationFeature.findOne({
          organizationId,
          featureName: featureName.toUpperCase(),
          status: 'ACTIVE'
        }).lean();
        return !!feature;
      });

      if (hasFeature) {
        return next();
      } else {
        throw new ForbiddenError(`Feature '${featureName}' is not enabled for your organization. Please upgrade your subscription.`);
      }
    } catch (error) {
      next(error);
    }
  };
};

module.exports = requireFeature;
