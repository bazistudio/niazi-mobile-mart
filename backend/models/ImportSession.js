const mongoose = require('mongoose');

const importSessionSchema = new mongoose.Schema(
  {
    tenantId: {
      type: String,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    userId: {
      type: String,
      ref: 'User',
      required: true,
    },
    fileName: String,
    module: {
      type: String,
      enum: ['products', 'customers', 'orders', 'expenses'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    totalRows: { type: Number, default: 0 },
    successfulRows: { type: Number, default: 0 },
    failedRows: { type: Number, default: 0 },
    errors: [
      {
        row: Number,
        message: String,
      }
    ],
    metadata: Object, // Stores the mapping used
    startedAt: Date,
    completedAt: Date,
  },
  {
    timestamps: true,
  }
);

importSessionSchema.index({ tenantId: 1, createdAt: -1 });

module.exports = mongoose.model('ImportSession', importSessionSchema);
