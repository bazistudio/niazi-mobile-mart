const mongoose = require("mongoose");
const businessSyncSchema = require("./plugins/businessSyncSchema");

const productSchema = new mongoose.Schema({
  organizationId: {
    type: String, // UUID
    required: true,
    index: true,
  },
  branchId: {
    type: String, // UUID
    index: true,
  },
  name: { type: String, required: true, trim: true },
  productCode: { type: String, required: true, uppercase: true, trim: true }, // e.g. ITEM-001
  sku: { type: String, uppercase: true, trim: true, index: true }, // User-defined SKU
  description: { type: String, trim: true },
  
  // Relationships
  itemTypeId: { type: String, ref: 'ItemType', index: true }, // ObjectId stored as string
  categoryId: { type: String, ref: 'Category', index: true }, // UUID string
  brandId: { type: mongoose.Schema.Types.Mixed, ref: 'Brand', index: true }, // ObjectId
  companyId: { type: mongoose.Schema.Types.Mixed, ref: 'Company', index: true }, // ObjectId
  colorId: { type: mongoose.Schema.Types.Mixed, ref: 'Color', index: true }, // ObjectId
  qualityId: { type: mongoose.Schema.Types.Mixed, ref: 'Quality', index: true }, // ObjectId
  baseUnitId: { type: String, required: true }, // UUID
  taxId: { type: String }, // UUID
  
  // Pricing & Value
  purchasePrice: { type: Number, default: 0 },
  salePrice: { type: Number, default: 0 },
  
  // Default Overrides
  defaultWarehouseId: { type: String }, // UUID
  defaultPriceListId: { type: String }, // UUID
  
  // Inventory Tracking
  trackInventory: { type: Boolean, default: true },
  allowNegativeStock: { type: Boolean, default: false },
  currentStock: { type: Number, default: 0 },
  minStock: { type: Number, default: 0 }, // Renamed from minimumStock to match user request
  maximumStock: { type: Number },
  reorderLevel: { type: Number, default: 0 },
  
  // Costing & Tracking Options
  costingMethod: { type: String, enum: ["FIFO", "LIFO", "AVERAGE"], default: "FIFO" },
  serialTracking: { type: Boolean, default: false },
  batchTracking: { type: Boolean, default: false },
  expiryTracking: { type: Boolean, default: false }
});

// Product Code must be unique per organization
productSchema.index({ organizationId: 1, productCode: 1 }, { unique: true });
// SKU must be unique per organization (but allow nulls)
productSchema.index(
  { organizationId: 1, sku: 1 }, 
  { unique: true, partialFilterExpression: { sku: { $type: "string" } } }
);

// Organization isolation and fast lookup indexes for master data
productSchema.index({ organizationId: 1, categoryId: 1 });
productSchema.index({ organizationId: 1, brandId: 1 });
productSchema.index({ organizationId: 1, companyId: 1 });
productSchema.index({ organizationId: 1, colorId: 1 });
productSchema.index({ organizationId: 1, qualityId: 1 });

productSchema.plugin(businessSyncSchema);

module.exports = mongoose.model("Product", productSchema);