const mongoose = require('mongoose');
const baseUuidSchema = require('./plugins/baseUuidSchema');

const syncEventSchema = new mongoose.Schema({
  organizationId: {
    type: String, // UUID
    required: true,
    index: true
  },
  deviceId: {
    type: String, // UUID
    required: true,
    index: true
  },
  userId: {
    type: String, // UUID
    required: true
  },
  entityType: {
    type: String,
    required: true,
    index: true
  },
  entityId: {
    type: String, // UUID
    required: true,
    index: true
  },
  action: {
    type: String,
    enum: ['CREATE', 'UPDATE', 'DELETE'],
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  // Sync events are immutable and should never be modified
  strict: true
});

syncEventSchema.plugin(baseUuidSchema);

module.exports = mongoose.model('SyncEvent', syncEventSchema);
