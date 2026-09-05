const mongoose = require("mongoose");
const applyEnterprisePlugins = require("./plugins/applyEnterprisePlugins");

const localizationSettingsSchema = new mongoose.Schema(
  {
    timezone: { type: String, default: "UTC" },
    dateFormat: { type: String, default: "YYYY-MM-DD" },
    timeFormat: { type: String, enum: ["12H", "24H"], default: "24H" },
    currencyId: { type: String, ref: "Currency" },
    language: { type: String, default: "en" },
    organizationId: { type: String, ref: 'Organization', unique: true }
  },
  {
    optimisticConcurrency: true,
    versionKey: 'version'
  }
);

applyEnterprisePlugins(localizationSettingsSchema, { tenant: true, publicPrefix: "STL" });
module.exports = mongoose.model("LocalizationSettings", localizationSettingsSchema);
