const mongoose = require("mongoose");
const businessSyncSchema = require("./plugins/businessSyncSchema");

const warehouseSchema = new mongoose.Schema({
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
  name: { type: String, required: true, trim: true },
  warehouseCode: { type: String, required: true, uppercase: true, trim: true },
  address: { type: String, trim: true },
  isDefault: { type: Boolean, default: false }
});

warehouseSchema.index({ organizationId: 1, warehouseCode: 1 }, { unique: true });

warehouseSchema.plugin(businessSyncSchema);

module.exports = mongoose.model("Warehouse", warehouseSchema);
