const mongoose = require("mongoose");
const applyEnterprisePlugins = require("./plugins/applyEnterprisePlugins");

const printerSettingsSchema = new mongoose.Schema(
  {
    receiptPrinterIp: { type: String },
    labelPrinterIp: { type: String },
    paperSize: { type: String, enum: ["58mm", "80mm", "A4"], default: "80mm" },
    printReceiptAutomatically: { type: Boolean, default: true },
    printLogoOnReceipt: { type: Boolean, default: true },
    organizationId: { type: String, ref: 'Organization', unique: true }
  },
  {
    optimisticConcurrency: true,
    versionKey: 'version'
  }
);

applyEnterprisePlugins(printerSettingsSchema, { tenant: true, publicPrefix: "STP" });
module.exports = mongoose.model("PrinterSettings", printerSettingsSchema);
