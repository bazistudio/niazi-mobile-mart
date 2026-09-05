const mongoose = require("mongoose");

const tenantSchema = new mongoose.Schema(
  {
    _id: {
      type: String, // V4 migration changed _id to String (UUIDv4)
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },

    businessType: {
      type: String,
      required: true,
      enum: ["SYSTEM", "RETAIL", "MEDICAL", "AUTO", "WHOLESALE"],
      default: "RETAIL",
    },

    // 🧠 MAIN CONTROL FIELD (replace isActive logic)
    status: {
      type: String,
      enum: ["pending", "active", "suspended", "deleted", "rejected"],
      default: "pending",
      index: true,
    },

    // 💳 SUBSCRIPTION SYSTEM (V1 Single Source of Truth)
    subscriptionPlan: {
      type: String,
      enum: ["15-day demo", "1 month", "1 year", "2 year", "3 year"],
      default: null,
    },
    subscriptionStart: {
      type: Date,
      default: null,
    },
    subscriptionEnd: {
      type: Date,
      default: null,
    },

    // 🔐 OWNER VERIFICATION
    ownerEmail: {
      type: String,
      required: true,
    },
    ownerPhone: {
      type: String,
      required: true,
    },

    // ⚠️ V1 ONLY: Store plain password to display in dashboard
    v1PlainPassword: {
      type: String,
    },

    // 🗑️ SOFT DELETE
    isDeleted: {
      type: Boolean,
      default: false,
    },

    // 🧑‍💼 Super Admin tracking
    approvedBy: {
      type: String,
      ref: "User",
      default: null,
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    suspendedBy: {
      type: String,
      ref: "User",
      default: null,
    },

    suspendedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Tenant", tenantSchema);