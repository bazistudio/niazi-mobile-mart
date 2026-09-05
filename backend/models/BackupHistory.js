const mongoose = require("mongoose");
const applyEnterprisePlugins = require("./plugins/applyEnterprisePlugins");

const backupHistorySchema = new mongoose.Schema(
  {
    backupType: { type: String, enum: ["FULL", "PARTIAL", "SETTINGS"], required: true },
    location: { type: String, required: true }, // e.g., S3 URL, local path
    size: { type: Number }, // Size in bytes
    checksum: { type: String }, // Integrity hash
    restoredAt: { type: Date },
    restoredBy: { type: String, ref: "User" }
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Immutable
    optimisticConcurrency: false,
    versionKey: false
  }
);

backupHistorySchema.index({ organizationId: 1, createdAt: -1 });

applyEnterprisePlugins(backupHistorySchema, { tenant: true, publicPrefix: "BAK" });
module.exports = mongoose.model("BackupHistory", backupHistorySchema);
