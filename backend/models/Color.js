const mongoose = require("mongoose");
const applyEnterprisePlugins = require("./plugins/applyEnterprisePlugins");

const colorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    hexCode: { type: String, trim: true },
  },
  {
    optimisticConcurrency: true,
    versionKey: 'version'
  }
);

colorSchema.index({ organizationId: 1, name: 1 }, { unique: true });

applyEnterprisePlugins(colorSchema, { tenant: true, publicPrefix: "COL" });

module.exports = mongoose.model("Color", colorSchema);
