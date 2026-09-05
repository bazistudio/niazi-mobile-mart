const mongoose = require("mongoose");

const featureAccessSchema = new mongoose.Schema(
  {
    plan: {
      type: String,
      required: true,
      unique: true,
      // e.g., "TRIAL", "BASIC", "PREMIUM", "ENTERPRISE"
    },
    enabledModules: [{
      type: String,
      // e.g., "sales", "inventory", "reports", "branches", "advanced_analytics", "api_access"
    }],
    limits: {
      maxShops: {
        type: Number,
        default: 1
      },
      maxUsersPerShop: {
        type: Number,
        default: 5
      },
      maxProducts: {
        type: Number,
        default: 1000
      }
    }
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("FeatureAccess", featureAccessSchema);
