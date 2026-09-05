const mongoose = require("mongoose");
const applyEnterprisePlugins = require("./plugins/applyEnterprisePlugins");

const productPriceSchema = new mongoose.Schema(
  {
    productId: { type: String, ref: "Product", required: true, index: true },
    priceListId: { type: String, ref: "PriceList", required: true, index: true },
    unitId: { type: String, ref: "Unit", required: true }, // Price per unit
    price: { type: Number, required: true },
    costPrice: { type: Number }, // Optional to track margin per price list
    isActive: { type: Boolean, default: true },
    effectiveFrom: { type: Date, default: Date.now },
    effectiveTo: { type: Date }
  },
  {
    optimisticConcurrency: true,
    versionKey: 'version'
  }
);

// Allow history but optimize lookups for the active price
productPriceSchema.index({ organizationId: 1, productId: 1, priceListId: 1, unitId: 1, isActive: 1 });
// Fast lookup for all prices of a product in an organization
productPriceSchema.index({ organizationId: 1, productId: 1 });

applyEnterprisePlugins(productPriceSchema, { tenant: true, publicPrefix: "PPR" });

module.exports = mongoose.model("ProductPrice", productPriceSchema);
