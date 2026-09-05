const mongoose = require("mongoose");
const applyEnterprisePlugins = require("./plugins/applyEnterprisePlugins");

const paymentRequestSchema = new mongoose.Schema(
  {
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
    subscriptionId: {
      type: String,
      ref: "Subscription",
      required: true,
    },
    packageId: {
      type: String,
      ref: "Package",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      required: true, // e.g., BANK_TRANSFER, JAZZCASH, EASYPAISA
    },
    transactionId: {
      type: String,
      required: true,
    },
    paymentScreenshot: {
      type: String, // URL to the uploaded image
    },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
      index: true,
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
    reviewedBy: {
      type: String,
      ref: "User",
    },
    reviewedAt: {
      type: Date,
    },
    notes: {
      type: String, // e.g., rejection reason from user perspective
    },
    adminNotes: {
      type: String, // internal notes
    },
  },
  {
    optimisticConcurrency: true,
    versionKey: "version",
  }
);

paymentRequestSchema.index(
  { ownerId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "PENDING" },
  }
);

applyEnterprisePlugins(paymentRequestSchema, { tenant: false, publicPrefix: "PYR" });

module.exports = mongoose.model("PaymentRequest", paymentRequestSchema);
