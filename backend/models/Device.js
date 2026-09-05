const mongoose = require('mongoose');
const baseUuidSchema = require('./plugins/baseUuidSchema');

const deviceSchema = new mongoose.Schema({
  organizationId: {
    type: String, // UUID
    required: true,
    index: true
  },
  branchId: {
    type: String, // UUID
    required: true,
    index: true
  },
  userId: {
    type: String, // UUID
    required: true,
    index: true
  },
  deviceName: {
    type: String,
    required: true
  },
  deviceType: {
    type: String,
    enum: ['ELECTRON_PC', 'ANDROID_POS', 'IOS_APP', 'WEB_BROWSER'],
    required: true
  },
  lastSyncAt: {
    type: Date
  },
  syncToken: {
    type: String
  }
});

// Apply the base UUID schema
deviceSchema.plugin(baseUuidSchema);

module.exports = mongoose.model('Device', deviceSchema);
