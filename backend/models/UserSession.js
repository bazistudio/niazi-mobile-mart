const mongoose = require("mongoose");
const applyEnterprisePlugins = require("./plugins/applyEnterprisePlugins");

const userSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      ref: "User",
      required: true,
      index: true,
    },
    refreshTokenHash: {
      type: String,
      required: true,
    },
    activeOrganizationId: {
      type: String,
      ref: "Organization"
    },
    activeShopId: {
      type: String,
      ref: "Shop"
    },
    tokenVersion: {
      type: Number,
      default: 0
    },
    lastContextSwitch: { type: Date },
    deviceId: { type: String, default: "unknown" },
    deviceType: { type: String },
    deviceName: { type: String },
    browser: { type: String },
    browserVersion: { type: String },
    platform: { type: String },
    ipAddress: { type: String },
    country: { type: String },
    city: { type: String },
    loginMethod: {
      type: String,
      enum: ["EMAIL", "PIN", "OTP", "GOOGLE", "MICROSOFT", "QR", "NFC", "RFID", "FINGERPRINT", "FACE", "DESKTOP"],
      required: true,
    },
    lastActivity: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // TTL index
    },
    status: {
      type: String,
      enum: ["ACTIVE", "REVOKED", "EXPIRED", "LOGGED_OUT"],
      default: "ACTIVE"
    },
    revokedAt: { type: Date },
    revokedBy: {
      type: String,
      ref: "User",
    }
  },
  {
    optimisticConcurrency: true,
    versionKey: 'version'
  }
);

applyEnterprisePlugins(userSessionSchema, { tenant: true, publicPrefix: "SES" });

module.exports = mongoose.model("UserSession", userSessionSchema);
