const mongoose = require("mongoose");
const applyEnterprisePlugins = require("./plugins/applyEnterprisePlugins");

const packageSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
    },
    durationType: {
      type: String,
      enum: ["DAYS", "MONTHS", "YEARS"],
      required: true,
    },
    durationValue: {
      type: Number,
      required: true,
      min: 1,
    },
    maxBranches: {
      type: Number,
      default: 1, // 0 for unlimited could be an option
    },
    maxUsers: {
      type: Number,
      default: 1, // 0 for unlimited
    },
    maxProducts: {
      type: Number,
      default: 100, // 0 for unlimited
    },
    storageLimit: {
      type: Number,
      default: 1024, // in MB. 0 for unlimited
    },
    enabledModules: [
      {
        type: String,
        trim: true,
      },
    ],
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    isTrial: {
      type: Boolean,
      default: false,
    },
  },
  {
    optimisticConcurrency: true,
    versionKey: "version",
  }
);

// Packages don't need tenant isolation because they are global.
applyEnterprisePlugins(packageSchema, { tenant: false, publicPrefix: "PKG" });

module.exports = mongoose.model("Package", packageSchema);
