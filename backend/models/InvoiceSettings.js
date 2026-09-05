const mongoose = require("mongoose");
const applyEnterprisePlugins = require("./plugins/applyEnterprisePlugins");

const invoiceSettingsSchema = new mongoose.Schema(
  {
    prefix: { type: String, default: "INV-" },
    nextNumber: { type: Number, default: 1 },
    footerText: { type: String },
    termsAndConditions: { type: String },
    showTaxId: { type: Boolean, default: true },
    defaultDueDateDays: { type: Number, default: 30 },
    organizationId: { type: String, ref: 'Organization', unique: true }
  },
  {
    optimisticConcurrency: true,
    versionKey: 'version'
  }
);

applyEnterprisePlugins(invoiceSettingsSchema, { tenant: true, publicPrefix: "STI" });
module.exports = mongoose.model("InvoiceSettings", invoiceSettingsSchema);
