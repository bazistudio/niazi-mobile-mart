const mongoose = require("mongoose");
const businessSyncSchema = require("./plugins/businessSyncSchema");

const stockMovementSchema = new mongoose.Schema({
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
  movementType: { type: String, enum: ["IN", "OUT", "TRANSFER", "ADJUSTMENT"], required: true },
  productId: { type: String, required: true, index: true }, // UUID
  warehouseId: { type: String, index: true }, // UUID
  sourceWarehouseId: { type: String }, // UUID
  destinationWarehouseId: { type: String }, // UUID
  quantity: { type: Number, required: true },
  batchNumber: { type: String },
  serialNumber: { type: String },
  reason: { type: String },
  referenceType: { type: String }, // e.g. "INVOICE", "ORDER"
  referenceId: { type: String, index: true } // UUID
});

// Fast lookup for stock calculations per product in an organization
stockMovementSchema.index({ organizationId: 1, productId: 1 });

stockMovementSchema.plugin(businessSyncSchema);

module.exports = mongoose.model("StockMovement", stockMovementSchema);
