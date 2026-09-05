const mongoose = require("mongoose");
const applyEnterprisePlugins = require("./plugins/applyEnterprisePlugins");

const partySchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["CUSTOMER", "SUPPLIER", "BOTH"], required: true, index: true },
    partyCode: { type: String, required: true, uppercase: true, trim: true },
    companyName: { type: String, trim: true },
    contactPerson: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    mobile: { type: String, trim: true },
    taxNumber: { type: String, trim: true },
    nationalId: { type: String, trim: true }, // optional
    address: { type: String, trim: true },
    
    // Ledger Integration
    creditLimit: { type: Number, default: 0 },
    openingBalance: { type: Number, default: 0 },
    openingBalanceType: { type: String, enum: ["DR", "CR"], default: "DR" },
    paymentTerms: { type: String, trim: true }, // e.g. "Net 30"
    
    isActive: { type: Boolean, default: true },
    notes: { type: String }
  },
  {
    optimisticConcurrency: true,
    versionKey: 'version'
  }
);

// Party Code must be unique per organization
partySchema.index({ organizationId: 1, partyCode: 1 }, { unique: true });

applyEnterprisePlugins(partySchema, { tenant: true, publicPrefix: "PTY" });

module.exports = mongoose.model("Party", partySchema);
