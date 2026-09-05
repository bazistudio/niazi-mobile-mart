const mongoose = require("mongoose");
const applyEnterprisePlugins = require("./plugins/applyEnterprisePlugins");

const subscriptionHistorySchema = new mongoose.Schema(
  {
    subscriptionId: {
      type: String,
      ref: "Subscription",
      required: true,
      index: true,
    },
    ownerType: {
      type: String,
      enum: ["ORGANIZATION", "SHOP"],
      required: true,
    },
    ownerId: {
      type: String,
      required: true,
      index: true,
    },
    packageId: {
      type: String,
      ref: "Package",
    },
    action: {
      type: String,
      enum: ["CREATED", "APPROVED", "RENEWED", "SUSPENDED", "EXPIRED", "RESUMED", "CANCELLED"],
      required: true,
    },
    oldExpiry: {
      type: Date,
    },
    newExpiry: {
      type: Date,
    },
    performedBy: {
      type: String,
      ref: "User",
      // can be null if system (cron) did it
    },
    paymentReference: {
      type: String,
      ref: "PaymentRequest",
    },
    notes: {
      type: String,
    },
    previousPrice: {
      type: Number,
    },
    newPrice: {
      type: Number,
    },
    previousPackage: {
      type: String,
      ref: "Package",
    },
    newPackage: {
      type: String,
      ref: "Package",
    },
  },
  {
    optimisticConcurrency: true,
    versionKey: "version",
  }
);

applyEnterprisePlugins(subscriptionHistorySchema, { tenant: false, publicPrefix: "SBH" });

module.exports = mongoose.model("SubscriptionHistory", subscriptionHistorySchema);
