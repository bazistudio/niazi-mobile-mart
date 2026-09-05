const mongoose = require('mongoose');
const businessSyncSchema = require("./plugins/businessSyncSchema");

const expenseSchema = new mongoose.Schema({
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
  title: {
    type: String,
    required: [true, 'Please add a title for the expense'],
    trim: true
  },
  amount: {
    type: Number,
    required: [true, 'Please add an amount']
  },
  category: {
    type: String,
    required: [true, 'Please add a category'],
    enum: ['rent', 'salary', 'utilities', 'transport', 'purchase', 'repair', 'other'],
    default: 'other'
  },
  paymentMethod: {
    type: String,
    required: [true, 'Please specify payment method'],
    enum: ['cash', 'bank', 'online']
  },
  note: {
    type: String,
    trim: true
  },
  date: {
    type: Date,
    default: Date.now,
    index: true
  },
  idempotencyKey: {
    type: String,
    sparse: true,
    index: true
  },
  ledgerEntryId: {
    type: String // UUID
  },
  printHistory: [{
    printedAt: { type: Date, default: Date.now },
    printedBy: { type: String }, // UUID
    copyNumber: { type: Number, default: 1 }
  }]
});

// Since idempotencyKey was unique but might be null, sparse was used, but we need organization scoped uniqueness if we want it.
expenseSchema.index({ organizationId: 1, idempotencyKey: 1 }, { unique: true, sparse: true });

expenseSchema.plugin(businessSyncSchema);

module.exports = mongoose.model('Expense', expenseSchema);
