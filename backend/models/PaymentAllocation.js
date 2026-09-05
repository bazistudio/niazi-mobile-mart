const mongoose = require("mongoose");
const businessSyncSchema = require("./plugins/businessSyncSchema");

const paymentAllocationSchema = new mongoose.Schema({
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
  paymentEntryId: {
    type: String, // UUID
    required: true,
    index: true,
    comment: "The LedgerEntry ID representing the payment"
  },
  invoiceId: {
    type: String, // UUID
    required: true,
    index: true,
    comment: "The Order/Invoice being settled"
  },
  amountAllocated: {
    type: Number,
    required: true,
    min: [0.01, 'Allocated amount must be greater than 0'],
  },
  customerId: {
    type: String, // UUID
    index: true,
  },
  supplierId: {
    type: String, // UUID
    index: true,
  }
});

paymentAllocationSchema.index({ organizationId: 1, paymentEntryId: 1 });
paymentAllocationSchema.index({ organizationId: 1, invoiceId: 1 });
paymentAllocationSchema.index({ organizationId: 1, customerId: 1 });

paymentAllocationSchema.plugin(businessSyncSchema);

module.exports = mongoose.model("PaymentAllocation", paymentAllocationSchema);
