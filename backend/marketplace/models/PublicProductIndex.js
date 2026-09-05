const mongoose = require('mongoose');
const VisibilityPolicySchema = require('../policies/VisibilityPolicy');

const PublicProductIndexSchema = new mongoose.Schema({
  uuid: { type: String, required: true, unique: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  productUuid: { type: String, required: true, index: true },
  title: { type: String, required: true },
  brand: { type: String },
  model: { type: String },
  category: { type: String },
  availability: { type: String, enum: ['IN_STOCK', 'OUT_OF_STOCK', 'PREORDER'], default: 'IN_STOCK' },
  city: { type: String },
  thumbnail: { type: String },
  visibilityPolicy: { type: VisibilityPolicySchema, default: () => ({}) },
  searchTokens: [{ type: String }],
  status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  indexedAt: { type: Date, default: Date.now }
}, { timestamps: true });

PublicProductIndexSchema.index({
  title: 'text',
  brand: 'text',
  model: 'text',
  category: 'text',
  searchTokens: 'text'
});

const PublicProductIndex = mongoose.model('PublicProductIndex', PublicProductIndexSchema);

module.exports = PublicProductIndex;
