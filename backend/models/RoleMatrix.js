const mongoose = require('mongoose');

const roleMatrixSchema = new mongoose.Schema(
  {
    tenantId: {
      type: String,
      ref: 'Tenant',
      required: true,
      index: true
    },
    shopId: {
      type: String,
      ref: 'Shop',
      required: true,
      index: true
    },
    role: {
      type: String,
      enum: ['SHOP_ADMIN', 'MANAGER', 'CASHIER', 'STAFF'],
      required: true
    },
    permissions: {
      POS_ACCESS: { type: Boolean, default: false },
      VIEW_LEDGER: { type: Boolean, default: false },
      VIEW_EXPENSES: { type: Boolean, default: false },
      CREATE_EXPENSE: { type: Boolean, default: false },
      VIEW_REPORTS: { type: Boolean, default: false },
      MANAGE_USERS: { type: Boolean, default: false },
      MANAGE_SETTINGS: { type: Boolean, default: false },
      DELETE_RECORDS: { type: Boolean, default: false },
      INVENTORY_VIEW: { type: Boolean, default: false }
    }
  },
  { timestamps: true }
);

// A shop should only have one configuration per role
roleMatrixSchema.index({ shopId: 1, role: 1 }, { unique: true });

module.exports = mongoose.model('RoleMatrix', roleMatrixSchema);
