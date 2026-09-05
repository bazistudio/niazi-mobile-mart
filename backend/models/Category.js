const mongoose = require("mongoose");
const businessSyncSchema = require("./plugins/businessSyncSchema");

const categorySchema = new mongoose.Schema({
  organizationId: {
    type: String, // UUID
    required: true,
    index: true,
  },
  branchId: {
    type: String, // UUID (Optional for Categories since they might be Org wide)
    index: true,
  },
  name: { type: String, required: true, trim: true },
  categoryCode: { type: String, required: true, uppercase: true, trim: true },
  description: { type: String, trim: true },
  parentId: { type: String, index: true }, // UUID
  sortOrder: { type: Number, default: 0 },
  image: { type: String, trim: true } // URL or file reference
});

categorySchema.index({ organizationId: 1, categoryCode: 1 }, { unique: true });

categorySchema.pre('save', function() {
  if (this.parentId && this.parentId === this._id) {
    throw new Error("A category cannot be its own parent");
  }
});

categorySchema.plugin(businessSyncSchema);

module.exports = mongoose.model("Category", categorySchema);
