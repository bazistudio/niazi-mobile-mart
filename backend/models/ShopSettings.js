const mongoose = require('mongoose');

const shopSettingsSchema = new mongoose.Schema(
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
      unique: true,
      index: true
    },
    layoutMode: {
      type: String,
      enum: ['classic', 'modern', 'dashboard'],
      default: 'modern'
    },
    language: {
      type: String,
      enum: ['en', 'ur', 'ar'],
      default: 'en'
    },
    printerVersion: {
      type: Number,
      default: 2
    },
    printer: {
      enabled: { type: Boolean, default: true },
      printerType: { type: String, enum: ['A4', 'THERMAL_80MM', 'THERMAL_58MM', 'PDF_ONLY', 'CUSTOM'], default: 'THERMAL_80MM' },
      connectionType: { type: String, enum: ['BROWSER_PRINT', 'USB', 'LAN', 'BLUETOOTH'], default: 'BROWSER_PRINT' },
      paperSize: {
        width: { type: String, enum: ['A4', '80mm', '58mm'], default: '80mm' },
        customWidth: { type: Number }
      },
      layout: {
        orientation: { type: String, enum: ['portrait', 'landscape'], default: 'portrait' },
        marginTop: { type: Number, default: 0 },
        marginBottom: { type: Number, default: 0 },
        marginLeft: { type: Number, default: 0 },
        marginRight: { type: Number, default: 0 }
      },
      font: {
        size: { type: Number, default: 12 },
        family: { type: String, enum: ['monospace', 'sans-serif'], default: 'monospace' }
      },
      invoice: {
        showLogo: { type: Boolean, default: false },
        showShopInfo: { type: Boolean, default: true },
        showBarcode: { type: Boolean, default: true },
        showQR: { type: Boolean, default: false },
        showTax: { type: Boolean, default: true },
        showDiscount: { type: Boolean, default: true }
      },
      autoPrint: { type: Boolean, default: false },
      printCopyCount: { type: Number, default: 1 }
    },
    shopHeader: {
      name: { type: String },
      address: { type: String },
      phone: { type: String },
      email: { type: String },
      taxNumber: { type: String },
      footerText: { type: String, default: 'Thank you for your business!' },
      logoUrl: { type: String }
    },
    backupEnabled: {
      type: Boolean,
      default: true
    },
    version: {
      type: Number,
      default: 1
    },
    updatedBy: {
      type: String,
      ref: 'User'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('ShopSettings', shopSettingsSchema);
