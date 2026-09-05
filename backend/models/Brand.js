const mongoose = require("mongoose");
const applyEnterprisePlugins = require("./plugins/applyEnterprisePlugins");

const brandSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    brandCode: { type: String, required: true, uppercase: true, trim: true },
    description: { type: String, trim: true },
    manufacturer: { type: String, trim: true },
    website: { type: String, trim: true },
    logo: { type: String, trim: true } // URL or file reference
  },
  {
    optimisticConcurrency: true,
    versionKey: 'version'
  }
);

brandSchema.index({ organizationId: 1, brandCode: 1 }, { unique: true });

applyEnterprisePlugins(brandSchema, { tenant: true, publicPrefix: "BRD" });

module.exports = mongoose.model("Brand", brandSchema);
