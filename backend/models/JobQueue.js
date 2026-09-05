const mongoose = require("mongoose");
const applyEnterprisePlugins = require("./plugins/applyEnterprisePlugins");

const jobQueueSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, index: true }, // e.g., Generate PDF, Export Excel
    status: { type: String, enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"], default: "PENDING", index: true },
    payload: { type: mongoose.Schema.Types.Mixed }, // Job arguments
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    scheduledAt: { type: Date, default: Date.now, index: true },
    startedAt: { type: Date },
    completedAt: { type: Date },
    failedAt: { type: Date },
    error: { type: String }
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
    versionKey: 'version'
  }
);

jobQueueSchema.index({ status: 1, scheduledAt: 1 }); // Worker queue polling

applyEnterprisePlugins(jobQueueSchema, { tenant: true, publicPrefix: "JOB" });
module.exports = mongoose.model("JobQueue", jobQueueSchema);
