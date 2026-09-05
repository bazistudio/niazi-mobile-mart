const mongoose = require("mongoose");
const businessSyncSchema = require("./plugins/businessSyncSchema");

const ledgerEntrySchema = new mongoose.Schema({
  organizationId: {
    type: String, // UUID
    required: true,
    index: true,
  },
  branchId: {
    type: String, // UUID
    required: true,
    index: true,
  },
  systemAccountId: { type: String, required: true, index: true }, // e.g. "CASH", "ACCOUNTS_RECEIVABLE"
  partyId: { type: String, index: true }, // UUID
  transactionId: { type: String, required: true, index: true }, // UUID, Shared across Order/Invoice/Movement
  referenceType: { type: String, required: true }, // e.g. "INVOICE", "PAYMENT"
  referenceId: { type: String, required: true }, // UUID
  type: { type: String, enum: ["DR", "CR"], required: true },
  amount: { type: Number, required: true },
  currencyId: { type: String }, // UUID
  exchangeRate: { type: Number, default: 1 }
});

ledgerEntrySchema.plugin(businessSyncSchema);

module.exports = mongoose.model("LedgerEntry", ledgerEntrySchema);
