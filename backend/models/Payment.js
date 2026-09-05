const mongoose = require("mongoose");
const businessSyncSchema = require("./plugins/businessSyncSchema");

const paymentSchema = new mongoose.Schema({
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
  paymentNumber: { type: String },
  displayNumber: { type: String, required: true },
  invoiceId: { type: String, index: true }, // UUID
  partyId: { type: String, required: true, index: true }, // UUID
  amount: { type: Number, required: true },
  currencyId: { type: String }, // UUID
  exchangeRate: { type: Number, default: 1 },
  paymentMethod: { type: String, required: true }, // e.g. "CASH", "CARD", "BANK_TRANSFER"
  referenceNumber: { type: String },
  receivedBy: { type: String }, // UUID
  notes: { type: String },
  paymentGateway: { type: String },
  gatewayTransactionId: { type: String },
  bankAccountId: { type: String }, // UUID
  cashDrawerId: { type: String } // UUID
});

paymentSchema.index({ organizationId: 1, displayNumber: 1 }, { unique: true });

paymentSchema.plugin(businessSyncSchema);

module.exports = mongoose.model("Payment", paymentSchema);