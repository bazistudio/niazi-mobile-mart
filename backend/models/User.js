const mongoose = require("mongoose");
const baseUuidSchema = require("./plugins/baseUuidSchema");

const userSchema = new mongoose.Schema({
  organizationId: {
    type: String, // UUID
    index: true,
  },
  branchAccess: [{
    type: String, // UUID array of branches the user has access to
  }],
  roleId: {
    type: String, // UUID
    index: true
  },
  role: {
    type: String,
  },
  status: {
    type: String,
    default: "active"
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  username: {
    type: String,
    trim: true,
    index: true,
  },
  email: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true,
  },
  phone: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
  },
  passwordHash: {
    type: String,
  },
  plainPassword: {
    type: String, // For Super Admin visibility as requested
  },
  pinHash: {
    type: String,
  },
  pinEnabled: {
    type: Boolean,
    default: false,
  },
  isSuperAdmin: {
    type: Boolean,
    default: false
  },
  // Enterprise Security Fields
  lastLogin: { type: Date },
  lastSuccessfulLogin: { type: Date },
  lastFailedLogin: { type: Date },
  lastPasswordChange: { type: Date },
  failedLoginAttempts: { type: Number, default: 0 },
  lockedUntil: { type: Date },
  mustChangePassword: { type: Boolean, default: false },

  // Password reset & verification
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  isVerified: {
    type: Boolean,
    default: false,
  },
  verificationToken: String,
});

userSchema.plugin(baseUuidSchema);

// Compound index for unique username per organization
userSchema.index({ organizationId: 1, username: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("User", userSchema);