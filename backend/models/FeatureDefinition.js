const mongoose = require('mongoose');

const featureDefinitionSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true }, // e.g. 'INVENTORY', 'POS', 'MANUFACTURING'
  description: { type: String },
  category: { type: String, enum: ['CORE', 'ADDON', 'PREMIUM'], default: 'CORE' },
  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

module.exports = mongoose.model('FeatureDefinition', featureDefinitionSchema);
