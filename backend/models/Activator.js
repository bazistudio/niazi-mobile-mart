const mongoose = require("mongoose");

const activatorSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      // Unique referral/activation code
    },
    commissionRate: {
      type: Number,
      required: true,
      default: 10, // Percentage
    },
    totalEarnings: {
      type: Number,
      default: 0,
    },
    referredOrganizations: [{
      type: String,
      ref: "Organization"
    }],
    status: {
      type: String,
      enum: ["ACTIVE", "SUSPENDED", "INACTIVE"],
      default: "ACTIVE"
    }
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Activator", activatorSchema);
