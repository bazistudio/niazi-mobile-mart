const mongoose = require("mongoose");
const baseUuidSchema = require("./plugins/baseUuidSchema");

const roleSchema = new mongoose.Schema({
  organizationId: {
    type: String, // UUID (Optional for system roles)
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  isSystem: {
    type: Boolean,
    default: false, // Super Admin, Owner, etc.
  },
  permissions: [{
    type: String // UUID of Permission
  }]
});

roleSchema.plugin(baseUuidSchema);

roleSchema.index({ organizationId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("Role", roleSchema);
