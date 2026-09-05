const mongoose = require('mongoose');
const applyEnterprisePlugins = require('./plugins/applyEnterprisePlugins');

const organizationFeatureSchema = new mongoose.Schema({
  organizationId: { type: String, ref: 'Organization', required: true, index: true },
  featureName: { type: String, required: true }, // Normalized to uppercase string
  enabledAt: { type: Date, default: Date.now },
  expiresAt: { type: Date }, // Optional for trial features
  status: { type: String, enum: ['ACTIVE', 'SUSPENDED'], default: 'ACTIVE' }
}, {
  timestamps: true
});

// An org can only have a feature enabled once
organizationFeatureSchema.index({ organizationId: 1, featureName: 1 }, { unique: true });

applyEnterprisePlugins(organizationFeatureSchema, { tenant: false, publicPrefix: "ORGF" });
module.exports = mongoose.model('OrganizationFeature', organizationFeatureSchema);
