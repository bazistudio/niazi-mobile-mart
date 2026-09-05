const mongoose = require("mongoose");
const applyEnterprisePlugins = require("./plugins/applyEnterprisePlugins");

const qualitySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // e.g., 'Original', 'A Grade', 'Copy'
    description: { type: String, trim: true },
  },
  {
    optimisticConcurrency: true,
    versionKey: 'version'
  }
);

qualitySchema.index({ organizationId: 1, name: 1 }, { unique: true });

applyEnterprisePlugins(qualitySchema, { tenant: true, publicPrefix: "QLT" });

module.exports = mongoose.model("Quality", qualitySchema);
