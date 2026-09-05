const mongoose = require('mongoose');

const ShopProfileSchema = new mongoose.Schema({
  uuid: { type: String, required: true, unique: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  name: { type: String, required: true },
  description: { type: String },
  logo: { type: String },
  city: { type: String },
  address: { type: String },
  phone: { type: String },
  email: { type: String },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' }
}, { timestamps: true });

ShopProfileSchema.index({ city: 1, name: 'text' });

const ShopProfile = mongoose.model('ShopProfile', ShopProfileSchema);

module.exports = ShopProfile;
