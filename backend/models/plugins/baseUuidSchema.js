const { v4: uuidv4 } = require('uuid');

/**
 * Base schema for all Mongoose models in TijaratPro V4.
 * Enforces UUIDv4 as the primary _id and includes audit & lifecycle fields.
 * Note: No redundant 'uuid' field is added.
 */
module.exports = function baseUuidSchema(schema, options = {}) {
  // Enforce _id as String (UUIDv4)
  schema.add({
    _id: { 
      type: String, 
      default: uuidv4 
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    },
    deletedAt: {
      type: Date,
      default: null
    },
    status: {
      type: String,
      default: 'ACTIVE',
      index: true
    },
    createdBy: {
      type: String // UUID of the user
    },
    updatedBy: {
      type: String // UUID of the user
    }
  });

  schema.set('timestamps', true); // Adds createdAt and updatedAt
};
