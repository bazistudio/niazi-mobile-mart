const mongoose = require("mongoose");
const applyEnterprisePlugins = require("./plugins/applyEnterprisePlugins");

const activityLogSchema = new mongoose.Schema(
  {
    userId: { type: String, ref: "User", index: true },
    action: { type: String, required: true, index: true }, // e.g., Login, Refund sale
    module: { type: String, index: true }, // e.g., Sales, Authentication
    entityType: { type: String, index: true }, // e.g., Invoice, Customer
    entityId: { type: String, index: true },
    description: { type: String },
    ipAddress: { type: String },
    deviceInfo: { type: String },
    browser: { type: String },
    os: { type: String }
  },
  {
    timestamps: true, // We specifically want createdAt for logs
    optimisticConcurrency: false, // Logs are immutable, no need for versioning
    versionKey: false
  }
);

// High-volume collection, ensure efficient querying
activityLogSchema.index({ organizationId: 1, createdAt: -1 });

applyEnterprisePlugins(activityLogSchema, { tenant: true, publicPrefix: "ACT" });
module.exports = mongoose.model("ActivityLog", activityLogSchema);
