const mongoose = require('mongoose');
const { PERMISSIONS, PRESET_ROLES } = require('../config/permissions');

const organizationMemberSchema = new mongoose.Schema(
  {
    organizationId: {
      type: String,
      ref: 'Organization',
      required: true,
      index: true,
    },
    userId: {
      type: String,
      ref: 'User',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: Object.values(PRESET_ROLES),
      default: PRESET_ROLES.STAFF,
      required: true,
    },
    permissions: [
      {
        type: String,
        enum: Object.values(PERMISSIONS),
      }
    ],
    isSystemOwner: {
      type: Boolean,
      default: false,
    },
    // For overriding permissions at a specific shop level.
    // If shopAccess is populated and the user is NOT an org-wide admin, they only get these shops.
    shopAccess: [
      {
        shopId: {
          type: String,
          ref: 'Shop',
          required: true,
        },
        role: {
          type: String,
          enum: Object.values(PRESET_ROLES),
        },
        permissions: [
          {
            type: String,
            enum: Object.values(PERMISSIONS),
          }
        ]
      }
    ],
    status: {
      type: String,
      enum: ['ACTIVE', 'INVITED', 'SUSPENDED'],
      default: 'ACTIVE',
    },
    invitedBy: {
      type: String,
      ref: 'User',
    }
  },
  {
    timestamps: true,
  }
);

// Ensure a user can only be added to an organization once
organizationMemberSchema.index({ organizationId: 1, userId: 1 }, { unique: true });
// Optimize status and role filtering
organizationMemberSchema.index({ organizationId: 1, status: 1 });
organizationMemberSchema.index({ organizationId: 1, role: 1 });

module.exports = mongoose.model('OrganizationMember', organizationMemberSchema);
