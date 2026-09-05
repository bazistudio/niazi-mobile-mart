const mongoose = require("mongoose");
const applyEnterprisePlugins = require("./plugins/applyEnterprisePlugins");

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: String, ref: "User", index: true }, // Null if organization-wide
    type: { type: String, enum: ["SYSTEM", "USER", "EMAIL", "SMS", "PUSH", "WHATSAPP"], required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    priority: { type: String, enum: ["LOW", "NORMAL", "HIGH", "CRITICAL"], default: "NORMAL" },
    isRead: { type: Boolean, default: false, index: true },
    sentAt: { type: Date, default: Date.now },
    readAt: { type: Date }
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
    versionKey: 'version'
  }
);

notificationSchema.index({ organizationId: 1, userId: 1, isRead: 1 });

applyEnterprisePlugins(notificationSchema, { tenant: true, publicPrefix: "NOT" });
module.exports = mongoose.model("Notification", notificationSchema);
