const mongoose = require("mongoose");
const baseUuidSchema = require("./plugins/baseUuidSchema");

const organizationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true,
    index: true,
  },
  subscriptionId: {
    type: String, // UUID
    index: true
  },

  code: {
    type: String,
    trim: true,
    uppercase: true,
    index: true
  },
  accountType: {
    type: String,
    enum: ["SINGLE_SHOP", "ORGANIZATION"],
    default: "ORGANIZATION",
  },
  businessType: {
    type: String,
    enum: ["SYSTEM", "RETAIL", "MEDICAL", "AUTO", "WHOLESALE", "RESTAURANT", "SALON", "MANUFACTURING"],
    default: "RETAIL",
  },
  industryType: {
    type: String,
    required: true,
    default: "GENERAL_STORE",
  },
  timezone: {
    type: String,
    default: "UTC"
  },
  currency: {
    type: String,
    default: "PKR"
  },
  country: {
    type: String
  },
  defaultLanguage: {
    type: String,
    default: "en"
  },
  limitsOverride: {
    maxBranches: { type: Number },
    maxUsers: { type: Number },
    maxProducts: { type: Number },
    storageLimit: { type: Number }
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
    }
  },
  themeVersion: { type: Number, default: 1 }
});

// Apply the base UUID schema (adds _id, status, timestamps, audit fields)
organizationSchema.plugin(baseUuidSchema);

module.exports = mongoose.model("Organization", organizationSchema);
