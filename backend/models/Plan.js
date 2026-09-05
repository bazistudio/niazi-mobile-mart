const mongoose = require("mongoose");
const applyEnterprisePlugins = require("./plugins/applyEnterprisePlugins");

const planSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String },
    price: { type: Number, required: true },
    billingCycle: { type: String, enum: ["MONTHLY", "YEARLY", "LIFETIME"], default: "MONTHLY" },
    limits: {
      maxUsers: { type: Number, default: 1 },
      maxBranches: { type: Number, default: 1 },
      maxProducts: { type: Number, default: 100 },
      storageGB: { type: Number, default: 1 }
    },
    features: {
      inventory: { type: Boolean, default: true },
      sales: { type: Boolean, default: true },
      purchases: { type: Boolean, default: true },
      ledger: { type: Boolean, default: false },
      payroll: { type: Boolean, default: false },
      crm: { type: Boolean, default: false },
      production: { type: Boolean, default: false },
      ai: { type: Boolean, default: false }
    }
  },
  {
    optimisticConcurrency: true,
    versionKey: 'version'
  }
);

applyEnterprisePlugins(planSchema, { tenant: false, publicPrefix: "PLN" });
module.exports = mongoose.model("Plan", planSchema);