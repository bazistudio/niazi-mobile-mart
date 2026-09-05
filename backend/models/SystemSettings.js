const mongoose = require("mongoose");

const systemSettingsSchema = new mongoose.Schema(
  {
    // There should theoretically only be one document in this collection
    singleton: {
      type: String,
      required: true,
      unique: true,
      default: "CONFIG"
    },
    trialDays: {
      type: Number,
      default: 15
    },
    pricing: {
      monthlyPrice: {
        type: Number,
        default: 5000
      },
      yearlyPrice: {
        type: Number,
        default: 50000
      }
    },
    maintenanceMode: {
      type: Boolean,
      default: false
    },
    allowRegistrations: {
      type: Boolean,
      default: true
    },
    contactInfo: {
      whatsappNumber: {
        type: String
      },
      supportEmail: {
        type: String
      }
    }
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("SystemSettings", systemSettingsSchema);
