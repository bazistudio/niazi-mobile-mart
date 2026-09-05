// models/UsageLog.js

const mongoose = require("mongoose");

const usageLogSchema =
new mongoose.Schema(
{
  shopId: {
    type: String,
    ref: "Shop"
  },

  service: {
    type: String,
    enum: [
      "sms",
      "whatsapp",
      "ai",
      "maps"
    ]
  },

  usageCount: {
    type: Number,
    default: 0
  },

  pricePerUnit: {
    type: Number
  },

  totalAmount: {
    type: Number
  },

  billingDate: {
    type: Date,
    default: Date.now
  }
},
{
  timestamps: true
}
);

module.exports =
mongoose.model(
  "UsageLog",
  usageLogSchema
);