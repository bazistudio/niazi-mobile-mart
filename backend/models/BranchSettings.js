const mongoose = require("mongoose");
const applyEnterprisePlugins = require("./plugins/applyEnterprisePlugins");

const branchSettingsSchema = new mongoose.Schema(
  {
    // branchId is added automatically by tenantIsolation plugin
    receiptPrinterIp: { type: String },
    invoicePrefix: { type: String },
    defaultWarehouseId: { type: String, ref: "Warehouse" },
    defaultCashDrawerId: { type: String },
    workingHours: { type: String },
    taxId: { type: String, ref: "Tax" } // default tax override
  },
  {
    optimisticConcurrency: true,
    versionKey: 'version'
  }
);

// One settings doc per branch
branchSettingsSchema.index({ organizationId: 1, branchId: 1 }, { unique: true });

applyEnterprisePlugins(branchSettingsSchema, { tenant: true, publicPrefix: "STBR" });
module.exports = mongoose.model("BranchSettings", branchSettingsSchema);
