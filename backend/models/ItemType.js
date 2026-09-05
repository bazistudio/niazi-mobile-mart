const mongoose = require("mongoose");
const applyEnterprisePlugins = require("./plugins/applyEnterprisePlugins");

const itemTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    isActive: { type: Boolean, default: true }
  },
  {
    optimisticConcurrency: true,
    versionKey: 'version'
  }
);

// Indexes
// Name must be unique per organization
itemTypeSchema.index({ organizationId: 1, name: 1 }, { unique: true });

applyEnterprisePlugins(itemTypeSchema, { tenant: true, publicPrefix: "ITY" });

module.exports = mongoose.model("ItemType", itemTypeSchema);
