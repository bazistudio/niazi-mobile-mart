const baseUuidSchema = require('./baseUuidSchema');
const tenantIsolation = require('./tenantIsolation');

/**
 * Extension of the base schema for offline-syncable business data.
 * Adds mandatory sync metadata for offline-first architecture.
 */
module.exports = function businessSyncSchema(schema, options = {}) {
  // First apply the base UUID schema
  baseUuidSchema(schema, options);

  // Add Sync Metadata
  schema.add({
    syncVersion: {
      type: Number,
      default: 1,
      index: true
    },
    lastSyncedAt: {
      type: Date,
      default: null
    },
    deviceId: {
      type: String, // UUID of the device that created/last updated this record
      index: true
    },
    createdFromDevice: {
      type: String // UUID of the origin device
    },
    updatedFromDevice: {
      type: String // UUID of the modifying device
    },
    syncStatus: {
      type: String,
      enum: ['PENDING', 'SYNCED', 'FAILED', 'CONFLICT'],
      default: 'PENDING',
      index: true
    }
  });

  // Pre-save hook to increment syncVersion on modification
  schema.pre('save', function() {
    if (this.isModified() && !this.isNew) {
      // If the backend API explicitly sets syncVersion (e.g. during conflict resolution), respect it
      if (!this.isModified('syncVersion')) {
        this.syncVersion += 1;
      }
    }
  });

  // Apply tenant isolation
  schema.plugin(tenantIsolation);
};
