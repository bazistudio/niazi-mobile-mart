const FeatureFlag = require("../models/FeatureFlag");
const logger = require("../utils/logger");

class FeatureFlagService {
  /**
   * Check if a feature is enabled for a specific tenant
   * @param {string} key - Feature key
   * @param {string} tenantId - Optional Tenant ID
   * @returns {Promise<boolean>}
   */
  async isEnabled(key, tenantId = null) {
    try {
      const flag = await FeatureFlag.findOne({ key });

      if (!flag) {
        return false; // Default to false if flag doesn't exist
      }

      // 1. If globally enabled, it's true
      if (flag.isEnabled) {
        return true;
      }

      // 2. If not globally enabled, check if tenant is whitelisted
      if (tenantId && flag.enabledTenants.includes(tenantId)) {
        return true;
      }

      return false;
    } catch (error) {
      logger.error(`Error checking feature flag ${key}:`, error);
      return false; // Fail safe to disabled
    }
  }

  /**
   * Get all flags for a specific tenant (for frontend state)
   */
  async getFlagsForTenant(tenantId) {
    try {
      const flags = await FeatureFlag.find({});
      const result = {};
      
      flags.forEach(flag => {
        result[flag.key] = flag.isEnabled || (tenantId && flag.enabledTenants.includes(tenantId));
      });
      
      return result;
    } catch (error) {
      logger.error("Error fetching flags for tenant:", error);
      return {};
    }
  }

  /**
   * Create or update a feature flag
   */
  async setFlag(key, data) {
    try {
      return await FeatureFlag.findOneAndUpdate(
        { key },
        { ...data, key },
        { upsert: true, new: true }
      );
    } catch (error) {
      logger.error(`Error setting feature flag ${key}:`, error);
      throw error;
    }
  }
}

module.exports = new FeatureFlagService();
