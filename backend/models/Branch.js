const mongoose = require("mongoose");
const baseUuidSchema = require("./plugins/baseUuidSchema");

const branchSchema = new mongoose.Schema({
  organizationId: {
    type: String, // UUID
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  code: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
  },
  phone: {
    type: String,
    trim: true,
  },
  email: {
    type: String,
    lowercase: true,
    trim: true,
  },
  address: {
    type: String,
    trim: true,
  },
  city: {
    type: String,
    trim: true,
  },
  cashBalance: {
    type: Number,
    default: 0,
    description: "Atomic counter for total cash balance derived from ledger"
  },

  // ===========================
  // THEME & BRANDING
  // ===========================
  theme: {
    mode: {
      type: String,
      enum: ['light', 'dark', 'system'],
      default: 'light'
    },
    typography: {
      mode: { type: String, enum: ['auto', 'custom'], default: 'auto' }
    },
    colors: {
      background: { type: String, default: '#f8fafc' },
      surface:    { type: String, default: '#ffffff' },
      primary:    { type: String, default: '#006970' },
      secondary:  { type: String, default: '#00b4bb' },
      text: {
        primary:  { type: String, default: '#111827' },
        secondary:{ type: String, default: '#374151' },
        muted:    { type: String, default: '#6b7280' },
        disabled: { type: String, default: '#9ca3af' }
      }
    },
    branding: {
      logo:    { type: String, default: '' },
      favicon: { type: String, default: '' }
    },
    // inheritFromParent: branches can later opt-in to inherit org theme
    inheritFromParent: { type: Boolean, default: true }
  },
  themeVersion: { type: Number, default: 1 }
});

// Apply the base UUID schema (adds _id, status, timestamps, audit fields)
branchSchema.plugin(baseUuidSchema);

// Ensure a branch code is unique within an organization
branchSchema.index({ organizationId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model("Branch", branchSchema);
