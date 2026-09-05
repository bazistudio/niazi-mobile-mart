const mongoose = require("mongoose");
const applyEnterprisePlugins = require("./plugins/applyEnterprisePlugins");

const companySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
  },
  {
    optimisticConcurrency: true,
    versionKey: 'version'
  }
);

companySchema.index({ organizationId: 1, name: 1 }, { unique: true });

applyEnterprisePlugins(companySchema, { tenant: true, publicPrefix: "CMP" });

module.exports = mongoose.model("Company", companySchema);
