const mongoose = require('mongoose');
const businessSyncSchema = require("./plugins/businessSyncSchema");

const customerSchema = new mongoose.Schema({
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
    required: [true, 'Customer name is required'],
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
  currentBalance: {
    type: Number,
    default: 0,
  },
  creditLimit: {
    type: Number,
    default: 100000, // Default 100k credit limit
  }
});

// Prevent duplicate phone number per organization
customerSchema.index({ organizationId: 1, phone: 1 }, { unique: true });

// Text indexing for fast search capabilities
customerSchema.index({
  name: "text",
  phone: "text",
});

customerSchema.plugin(businessSyncSchema);

module.exports = mongoose.model('Customer', customerSchema);
