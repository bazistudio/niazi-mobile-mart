const mongoose = require("mongoose");

const featureFlagSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: String,
    isEnabled: {
      type: Boolean,
      default: false,
    },
    isPremium: {
      type: Boolean,
      default: false,
    },
    enabledTenants: [
      {
        type: String,
        ref: "Tenant",
      },
    ],
    rolloutPercentage: {
      type: Number,
      default: 100,
      min: 0,
      max: 100,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("FeatureFlag", featureFlagSchema);
