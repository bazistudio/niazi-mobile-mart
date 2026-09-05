const mongoose = require("mongoose");
const applyEnterprisePlugins = require("./plugins/applyEnterprisePlugins");

const notificationSettingsSchema = new mongoose.Schema(
  {
    emailAlerts: { type: Boolean, default: true },
    smsAlerts: { type: Boolean, default: false },
    notifyOnLowStock: { type: Boolean, default: true },
    notifyOnNewOrder: { type: Boolean, default: true },
    notifyOnDailySummary: { type: Boolean, default: true },
    organizationId: { type: String, ref: 'Organization', unique: true }
  },
  {
    optimisticConcurrency: true,
    versionKey: 'version'
  }
);

applyEnterprisePlugins(notificationSettingsSchema, { tenant: true, publicPrefix: "STN" });
module.exports = mongoose.model("NotificationSettings", notificationSettingsSchema);
