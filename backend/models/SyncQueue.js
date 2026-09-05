const mongoose = require('mongoose');
const baseUuidSchema = require('./plugins/baseUuidSchema');

const syncQueueSchema = new mongoose.Schema({
  deviceId: {
    type: String, // UUID
    required: true,
    index: true
  },
  organizationId: {
    type: String, // UUID
    required: true,
    index: true
  },
  entityType: {
    type: String,
    required: true
  },
  entityId: {
    type: String, // UUID
    required: true
  },
  operation: {
    type: String,
    enum: ['CREATE', 'UPDATE', 'DELETE'],
    required: true
  },
  payload: {
    type: mongoose.Schema.Types.Mixed, // The actual data to be synced
    required: true
  },
  syncStatus: {
    type: String,
    enum: ['PENDING', 'SYNCED', 'FAILED'],
    default: 'PENDING',
    index: true
  },
  retryCount: {
    type: Number,
    default: 0
  },
  errorLog: {
    type: String
  }
});

syncQueueSchema.plugin(baseUuidSchema);

module.exports = mongoose.model('SyncQueue', syncQueueSchema);
