const mongoose = require("mongoose");
const businessSyncSchema = require("./plugins/businessSyncSchema");

const invoiceItemSchema = new mongoose.Schema({
  productId: { type: String }, // UUID
  sku: { type: String },
  productName: { type: String, required: true },
  barcode: { type: String },
  unitName: { type: String },
  taxRate: { type: Number, default: 0 },
  purchasePrice: { type: Number, default: 0 },
  salePrice: { type: Number, required: true },
  quantity: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  total: { type: Number, required: true }
}, { _id: false });

const invoiceSchema = new mongoose.Schema({
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
  invoiceNumber: { type: String },
  displayNumber: { type: String, required: true },
  orderId: { type: String, index: true }, // UUID
  partyId: { type: String, required: true, index: true }, // UUID
  status: { 
    type: String, 
    enum: ["Draft", "Issued", "PartiallyPaid", "Paid", "Overdue", "Cancelled", "Refunded"], 
    default: "Draft" 
  },
  dueDate: { type: Date },
  items: [invoiceItemSchema],
  subTotal: { type: Number, default: 0 },
  taxTotal: { type: Number, default: 0 },
  discountTotal: { type: Number, default: 0 },
  grandTotal: { type: Number, default: 0 }
});

invoiceSchema.index({ organizationId: 1, displayNumber: 1 }, { unique: true });

invoiceSchema.plugin(businessSyncSchema);

module.exports = mongoose.model("Invoice", invoiceSchema);