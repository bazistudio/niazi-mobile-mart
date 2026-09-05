const mongoose = require("mongoose");
const businessSyncSchema = require("./plugins/businessSyncSchema");

const stockReceiptItemSchema = new mongoose.Schema({
  productId: { type: String, required: true }, // UUID
  quantity: { type: Number, required: true },
  purchasePrice: { type: Number, required: true },
  batchNo: { type: String, trim: true },
  expiryDate: { type: Date }
}, { _id: false });

const stockReceiptSchema = new mongoose.Schema({
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
  receiptNo: { type: String, required: true },
  supplierId: { type: String }, // UUID
  warehouseId: { type: String, required: true }, // UUID
  invoiceNo: { type: String, trim: true },
  receiptDate: { type: Date, default: Date.now },
  remarks: { type: String, trim: true },
  totalAmount: { type: Number, default: 0 },
  items: [stockReceiptItemSchema]
});

// ReceiptNo must be unique per organization
stockReceiptSchema.index({ organizationId: 1, receiptNo: 1 }, { unique: true });
stockReceiptSchema.index({ organizationId: 1, receiptDate: -1 });

stockReceiptSchema.plugin(businessSyncSchema);

module.exports = mongoose.model("StockReceipt", stockReceiptSchema);
