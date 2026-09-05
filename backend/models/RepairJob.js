const mongoose = require('mongoose');

const timelineSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: [
      'Job Created', 'Received', 'Diagnosing', 'Waiting Customer Approval', 'Waiting Parts',
      'Repair In Progress', 'Quality Check', 'Ready for Pickup', 'Delivered',
      'Cancelled', 'Rejected', 'On Hold', 'Returned Under Warranty',
      'Status Changed', 'Part Added', 'Part Removed', 'Payment Received',
      'Customer Approved', 'Technician Changed', 'Invoice Generated'
    ],
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  user: {
    type: String,
    ref: 'User'
  },
  description: String,
  note: String
});

const partUsedSchema = new mongoose.Schema({
  productId: {
    type: String,
    ref: 'Product',
    required: true
  },
  qty: {
    type: Number,
    required: true,
    min: 1
  },
  cost: {
    type: Number,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  addedAt: {
    type: Date,
    default: Date.now
  },
  addedBy: {
    type: String,
    ref: 'User'
  }
});

const laborChargeSchema = new mongoose.Schema({
  description: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  }
});

const repairPaymentSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  method: {
    type: String,
    enum: ['Cash', 'Bank Transfer', 'Card', 'Other'],
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  reference: String,
  ledgerEntryId: {
    type: String,
    ref: 'LedgerEntry'
  },
  receivedBy: {
    type: String,
    ref: 'User'
  }
});

const repairJobSchema = new mongoose.Schema({
  organizationId: {
    type: String,
    ref: 'Organization',
    required: true,
    index: true
  },
  branchId: {
    type: String,
    ref: 'Branch',
    required: true,
    index: true
  },
  jobId: {
    type: String,
    required: true,
    unique: true
  },
  customerId: {
    type: String,
    required: true,
    refPath: 'customerModel'
  },
  customerModel: {
    type: String,
    required: true,
    enum: ['Customer', 'Party']
  },
  device: {
    type: { type: String }, // e.g. Phone, Tablet, Laptop
    brand: String,
    model: String,
    color: String,
    imei: String, // IMEI or Serial Number
    password: String // Device password or pattern text
  },
  accessories: {
    charger: { type: Boolean, default: false },
    battery: { type: Boolean, default: false },
    sim: { type: Boolean, default: false },
    memoryCard: { type: Boolean, default: false },
    cover: { type: Boolean, default: false },
    box: { type: Boolean, default: false },
    other: String
  },
  problemDescription: {
    type: String,
    required: true
  },
  initialInspection: [{
    type: String // e.g. 'Screen Broken', 'Water Damage'
  }],
  technicianId: {
    type: String,
    ref: 'User'
  },
  priority: {
    type: String,
    enum: ['Low', 'Normal', 'High', 'Urgent'],
    default: 'Normal'
  },
  estimatedCost: {
    type: Number,
    default: 0
  },
  expectedDeliveryDate: Date,
  status: {
    type: String,
    enum: [
      'Received', 'Diagnosing', 'Waiting Customer Approval', 'Waiting Parts',
      'Repair In Progress', 'Quality Check', 'Ready for Pickup', 'Delivered',
      'Cancelled', 'Rejected', 'On Hold', 'Returned Under Warranty'
    ],
    default: 'Received'
  },
  timeline: [timelineSchema],
  partsUsed: [partUsedSchema],
  laborCharges: [laborChargeSchema],
  additionalCharges: {
    type: Number,
    default: 0
  },
  discount: {
    type: Number,
    default: 0
  },
  payments: [repairPaymentSchema],
  internalNotes: String, // Technician-only notes
  customerNotes: String, // Visible to customer (e.g. warranty terms)
  images: {
    before: [String],
    after: [String],
    proof: [String]
  },
  warranty: {
    period: String, // e.g. '3 Months'
    expiryDate: Date,
    notes: String,
    status: {
      type: String,
      enum: ['Active', 'Expired', 'Voided'],
      default: 'Active'
    }
  },
  invoiceId: {
    type: String,
    ref: 'Invoice'
  }
}, {
  timestamps: true,
  optimisticConcurrency: true
});

// Calculate total parts cost
repairJobSchema.virtual('partsTotal').get(function() {
  return this.partsUsed.reduce((sum, part) => sum + (part.price * part.qty), 0);
});

// Calculate total labor
repairJobSchema.virtual('laborTotal').get(function() {
  return this.laborCharges.reduce((sum, labor) => sum + labor.amount, 0);
});

// Calculate grand total (Parts + Labor + Additional - Discount)
repairJobSchema.virtual('grandTotal').get(function() {
  return this.partsTotal + this.laborTotal + this.additionalCharges - this.discount;
});

// Calculate total paid
repairJobSchema.virtual('totalPaid').get(function() {
  return this.payments.reduce((sum, p) => sum + p.amount, 0);
});

// Calculate remaining balance
repairJobSchema.virtual('remainingBalance').get(function() {
  return this.grandTotal - this.totalPaid;
});

// Ensure virtuals are included in JSON/Object conversions
repairJobSchema.set('toJSON', { virtuals: true });
repairJobSchema.set('toObject', { virtuals: true });

const RepairJob = mongoose.model('RepairJob', repairJobSchema);
module.exports = RepairJob;
