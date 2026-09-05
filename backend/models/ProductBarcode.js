const mongoose = require("mongoose");
const applyEnterprisePlugins = require("./plugins/applyEnterprisePlugins");

const productBarcodeSchema = new mongoose.Schema(
  {
    productId: { type: String, ref: "Product", required: true, index: true },
    unitId: { type: String, ref: "Unit", required: true }, // Barcode per specific unit
    barcode: { type: String, required: true, trim: true }
  },
  {
    optimisticConcurrency: true,
    versionKey: 'version'
  }
);

// Barcode must be globally unique inside an organization
productBarcodeSchema.index({ organizationId: 1, barcode: 1 }, { unique: true });

applyEnterprisePlugins(productBarcodeSchema, { tenant: true, publicPrefix: "PBC" });

module.exports = mongoose.model("ProductBarcode", productBarcodeSchema);
