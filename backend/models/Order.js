const mongoose = require("mongoose");
const businessSyncSchema = require("./plugins/businessSyncSchema");

const orderItemSchema = new mongoose.Schema({
  productId: { type: String, required: true }, // UUID
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
}, { _id: false }); // Avoid auto-generating ObjectId for sub-documents

const orderSchema = new mongoose.Schema({
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
  orderNumber: { type: String }, // e.g. SAL-2026-000001
  displayNumber: { type: String, required: true },
  partyId: { type: String, required: true, index: true }, // UUID of Customer
  status: { 
    type: String, 
    enum: ["Draft", "Pending", "Confirmed", "Processing", "Completed", "Cancelled", "Returned", "PartiallyReturned"], 
    default: "Draft" 
  },
  items: [orderItemSchema],
  subTotal: { type: Number, default: 0 },
  taxTotal: { type: Number, default: 0 },
  discountTotal: { type: Number, default: 0 },
  grandTotal: { type: Number, default: 0 },
  paymentMethod: { type: String, trim: true },
  paymentStatus: { type: String, trim: true }
});

orderSchema.index({ organizationId: 1, displayNumber: 1 }, { unique: true });

orderSchema.plugin(businessSyncSchema);

module.exports = mongoose.model("Order", orderSchema);