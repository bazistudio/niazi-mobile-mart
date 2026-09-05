const Subscription = require('../../models/Subscription');
const Plan = require('../../models/Plan');
const License = require('../../models/License');

class FeatureService {
  constructor() {
    this.cache = new Map();
  }

  getCacheKey(organizationId) {
    return `features:${organizationId}`;
  }

  async loadFeatures(organizationId) {
    const key = this.getCacheKey(organizationId);
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    // 1. Check for Active Subscription
    const subscription = await Subscription.findOne({ organizationId, status: { $in: ['ACTIVE', 'TRIAL'] } }).populate('planId').lean();
    let features = {};

    if (subscription && subscription.planId && subscription.planId.features) {
      features = { ...subscription.planId.features };
    }

    // 2. Fallback to Offline License if no active subscription (e.g. Electron offline mode)
    if (!subscription) {
      const license = await License.findOne({ organizationId, expiresAt: { $gt: new Date() } }).lean();
      if (license && license.metadata && license.metadata.features) {
        features = { ...license.metadata.features };
      }
    }

    this.cache.set(key, features);
    return features;
  }

  async canUse(organizationId, featureName) {
    const features = await this.loadFeatures(organizationId);
    return !!features[featureName];
  }

  invalidateCache(organizationId) {
    this.cache.delete(this.getCacheKey(organizationId));
  }
}

module.exports = new FeatureService();
