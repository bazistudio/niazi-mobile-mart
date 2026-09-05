const mongoose = require("mongoose");
const applyEnterprisePlugins = require("./plugins/applyEnterprisePlugins");

const priceListSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // e.g. VIP, Wholesale
    priceListCode: { type: String, required: true, uppercase: true, trim: true },
    currencyId: { type: String, ref: "Currency" },
    priority: { type: Number, default: 0 },
    effectiveFrom: { type: Date },
    effectiveTo: { type: Date },
    isActive: { type: Boolean, default: true }
  },
  {
    optimisticConcurrency: true,
    versionKey: 'version'
  }
);

priceListSchema.index({ organizationId: 1, priceListCode: 1 }, { unique: true });

applyEnterprisePlugins(priceListSchema, { tenant: true, publicPrefix: "PRL" });

module.exports = mongoose.model("PriceList", priceListSchema);
