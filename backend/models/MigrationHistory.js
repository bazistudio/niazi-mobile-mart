const mongoose = require("mongoose");
const applyEnterprisePlugins = require("./plugins/applyEnterprisePlugins");

const migrationHistorySchema = new mongoose.Schema(
  {
    migrationId: { type: String, required: true, unique: true }, // The filename or ID
    migrationName: { type: String, required: true },
    version: { type: String, required: true }, // e.g. "V3.0"
    executedAt: { type: Date, default: Date.now },
    duration: { type: Number }, // ms
    executedBy: { type: String }, // User or system
    status: { type: String, enum: ["SUCCESS", "FAILED", "ROLLED_BACK"], required: true },
    rollbackAvailable: { type: Boolean, default: false },
    errorLog: { type: String }
  },
  {
    timestamps: false,
    optimisticConcurrency: false,
    versionKey: false
  }
);

migrationHistorySchema.index({ executedAt: -1 });

// Note: MigrationHistory is global, it applies across the system, not tied to a single tenant.
applyEnterprisePlugins(migrationHistorySchema, { tenant: false, publicPrefix: "MIG" });

module.exports = mongoose.model("MigrationHistory", migrationHistorySchema);
