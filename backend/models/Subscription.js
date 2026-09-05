const mongoose = require("mongoose");
const baseUuidSchema = require("./plugins/baseUuidSchema");

const subscriptionSchema = new mongoose.Schema({
  organizationId: {
    type: String, // UUID
    required: true,
    index: true,
    unique: true // 1 active subscription per organization logic applied downstream
  },
  planId: {
    type: String, // UUID
    required: true,
  },
  startsAt: {
    type: Date,
  },
  expiresAt: {
    type: Date,
    index: true,
  },
  paymentStatus: {
    type: String,
    enum: ["UNPAID", "PENDING", "PAID", "REJECTED"],
    default: "UNPAID",
  },
  limits: {
    maxBranches: { type: Number },
    maxUsers: { type: Number },
    maxDevices: { type: Number },
    maxProducts: { type: Number },
    storageLimit: { type: Number }
  },
  enabledModules: [{
    type: String
  }],
  currency: {
    type: String,
    default: "PKR",
  },
  discount: {
    type: Number,
    default: 0,
    min: 0,
  },
  approvedBy: {
    type: String, // UUID of User
  },
  approvedAt: {
    type: Date,
  },
  lastRenewalDate: {
    type: Date,
  },
  nextRenewalDate: {
    type: Date,
  },
  autoRenew: {
    type: Boolean,
    default: false,
  },
  suspendReason: {
    type: String,
  },
  notes: {
    type: String,
  }
});

// Calculate remaining days
subscriptionSchema.virtual("remainingDays").get(function () {
  if (!this.expiresAt) return 0;
  const now = new Date();
  const diffTime = this.expiresAt - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
});

subscriptionSchema.plugin(baseUuidSchema);

module.exports = mongoose.model("Subscription", subscriptionSchema);