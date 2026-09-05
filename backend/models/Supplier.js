const mongoose = require('mongoose');
const businessSyncSchema = require("./plugins/businessSyncSchema");

const supplierSchema = new mongoose.Schema({
  organizationId: {
    type: String, // UUID
    required: [true, 'Organization ID is required'],
    index: true,
  },
  branchId: {
    type: String, // UUID
    required: [true, 'Branch ID is required'],
    index: true,
  },
  name: {
    type: String,
    required: [true, 'Supplier name is required'],
    trim: true,
    index: true,
  },
  companyName: {
    type: String,
    trim: true,
    index: true,
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
    index: true,
    match: [/^[0-9]{10,15}$/, 'Please enter a valid phone number'],
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    index: true,
  },
  address: {
    type: String,
    trim: true,
  },
  currentPayable: {
    type: Number,
    default: 0,
  },
  totalPurchases: {
    type: Number,
    default: 0,
  }
});

supplierSchema.index({ organizationId: 1, phone: 1 }, { unique: true });

// Text indexing for fast search
supplierSchema.index({
  name: "text",
  phone: "text",
  companyName: "text"
});

supplierSchema.plugin(businessSyncSchema);

module.exports = mongoose.model('Supplier', supplierSchema);
