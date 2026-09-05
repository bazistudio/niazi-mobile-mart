const mongoose = require("mongoose");
const applyEnterprisePlugins = require("./plugins/applyEnterprisePlugins");

const auditLogSchema = new mongoose.Schema(
  {
    userId: { type: String, ref: "User", index: true },
    requestId: { type: String, index: true },
    sessionId: { type: String, ref: "UserSession" },
    entityType: { type: String, index: true },
    entityId: { type: String, index: true },
    action: { type: String, required: true },
    resource: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed },
    oldValue: { type: mongoose.Schema.Types.Mixed },
    newValue: { type: mongoose.Schema.Types.Mixed },
    reason: { type: String },
    ipAddress: { type: String },
    device: { type: String },
    browser: { type: String }
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Immutable
    optimisticConcurrency: false,
    versionKey: false
  }
);

auditLogSchema.index({ organizationId: 1, entityType: 1, entityId: 1 });

applyEnterprisePlugins(auditLogSchema, { tenant: true, publicPrefix: "ADT" });
module.exports = mongoose.model("AuditLog", auditLogSchema);
