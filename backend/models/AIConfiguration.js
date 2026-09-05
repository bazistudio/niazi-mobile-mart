const mongoose = require("mongoose");
const applyEnterprisePlugins = require("./plugins/applyEnterprisePlugins");

const aiConfigurationSchema = new mongoose.Schema(
  {
    enabledModels: [{ type: String }],
    preferences: { type: mongoose.Schema.Types.Mixed },
    organizationId: { type: String, ref: 'Organization', unique: true }
  },
  {
    optimisticConcurrency: true,
    versionKey: 'version'
  }
);

applyEnterprisePlugins(aiConfigurationSchema, { tenant: true, publicPrefix: "AIC" });
module.exports = mongoose.model("AIConfiguration", aiConfigurationSchema);
