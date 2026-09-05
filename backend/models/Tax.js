const mongoose = require("mongoose");
const applyEnterprisePlugins = require("./plugins/applyEnterprisePlugins");

const taxSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    taxCode: { type: String, required: true, uppercase: true, trim: true },
    rate: { type: Number, required: true }, // e.g. 5.0 for 5%
    country: { type: String, trim: true },
    isInclusive: { type: Boolean, default: false },
    isDefault: { type: Boolean, default: false }
  },
  {
    optimisticConcurrency: true,
    versionKey: 'version'
  }
);

taxSchema.index({ organizationId: 1, taxCode: 1 }, { unique: true });

applyEnterprisePlugins(taxSchema, { tenant: true, publicPrefix: "TAX" });

module.exports = mongoose.model("Tax", taxSchema);
