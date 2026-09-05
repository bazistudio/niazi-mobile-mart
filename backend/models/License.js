const mongoose = require("mongoose");
const applyEnterprisePlugins = require("./plugins/applyEnterprisePlugins");

const licenseSchema = new mongoose.Schema(
  {
    licenseKey: { type: String, required: true, unique: true },
    type: { type: String, enum: ["OFFLINE", "ENTERPRISE", "TRIAL"], required: true },
    issuedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date },
    hardwareFingerprint: { type: String }, // For offline electron tying
    metadata: { type: mongoose.Schema.Types.Mixed }, // Extra info
    organizationId: { type: String, ref: 'Organization', index: true }
  },
  {
    optimisticConcurrency: true,
    versionKey: 'version'
  }
);

applyEnterprisePlugins(licenseSchema, { tenant: true, publicPrefix: "LIC" });
module.exports = mongoose.model("License", licenseSchema);
