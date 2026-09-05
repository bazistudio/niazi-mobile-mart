const mongoose = require("mongoose");
const applyEnterprisePlugins = require("./plugins/applyEnterprisePlugins");

const securitySettingsSchema = new mongoose.Schema(
  {
    passwordPolicy: {
      minLength: { type: Number, default: 8 },
      requireUppercase: { type: Boolean, default: true },
      requireNumbers: { type: Boolean, default: true },
      requireSymbols: { type: Boolean, default: false }
    },
    mfaEnabled: { type: Boolean, default: false },
    sessionTimeoutMinutes: { type: Number, default: 60 },
    maxFailedLogins: { type: Number, default: 5 },
    lockoutDurationMinutes: { type: Number, default: 15 },
    organizationId: { type: String, ref: 'Organization', unique: true }
  },
  {
    optimisticConcurrency: true,
    versionKey: 'version'
  }
);

applyEnterprisePlugins(securitySettingsSchema, { tenant: true, publicPrefix: "STS" });
module.exports = mongoose.model("SecuritySettings", securitySettingsSchema);
