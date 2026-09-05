const mongoose = require("mongoose");
const applyEnterprisePlugins = require("./plugins/applyEnterprisePlugins");

const businessSettingsSchema = new mongoose.Schema(
  {
    companyName: { type: String, required: true },
    legalName: { type: String },
    taxId: { type: String },
    registrationNumber: { type: String },
    phone: { type: String },
    email: { type: String },
    website: { type: String },
    address: { type: String },
    logoUrl: { type: String },
    organizationId: { type: String, ref: 'Organization', unique: true }
  },
  {
    optimisticConcurrency: true,
    versionKey: 'version'
  }
);

applyEnterprisePlugins(businessSettingsSchema, { tenant: true, publicPrefix: "STB" });
module.exports = mongoose.model("BusinessSettings", businessSettingsSchema);
