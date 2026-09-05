const mongoose = require("mongoose");
const applyEnterprisePlugins = require("./plugins/applyEnterprisePlugins");

const idempotencyRecordSchema = new mongoose.Schema(
  {
    userId: { type: String, ref: "User", index: true },
    idempotencyKey: { type: String, required: true, trim: true },
    requestHash: { type: String, required: true },
    requestMethod: { type: String, required: true },
    requestPath: { type: String, required: true },
    responseStatus: { type: Number },
    responseBody: { type: mongoose.Schema.Types.Mixed },
    transactionType: { type: String }, // e.g. "SALE", "PURCHASE"
    resourceId: { type: String }, // e.g. Order ID
    expiresAt: { type: Date, required: true, index: { expires: 0 } }
  },
  {
    optimisticConcurrency: true,
    versionKey: 'version'
  }
);

// Idempotency key must be unique per organization
idempotencyRecordSchema.index({ organizationId: 1, idempotencyKey: 1 }, { unique: true });

applyEnterprisePlugins(idempotencyRecordSchema, { tenant: true, publicPrefix: "IDM" });

module.exports = mongoose.model("IdempotencyRecord", idempotencyRecordSchema);
