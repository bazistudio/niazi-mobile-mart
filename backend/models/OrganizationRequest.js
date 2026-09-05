const mongoose = require('mongoose');
const applyEnterprisePlugins = require('./plugins/applyEnterprisePlugins');

const organizationRequestSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  ownerId: { type: String, ref: 'User', required: true },
  accountType: { type: String, enum: ['SINGLE_SHOP', 'ORGANIZATION'], default: 'SINGLE_SHOP' },
  businessType: { type: String, enum: ["SYSTEM", "RETAIL", "MEDICAL", "AUTO", "WHOLESALE", "RESTAURANT", "SALON", "MANUFACTURING"], required: true, default: 'RETAIL' },
  status: { type: String, enum: ['PENDING', 'PROCESSING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
  reviewedBy: { type: String, ref: 'User' },
  reviewNote: { type: String },
  tempPassword: { type: String },
}, {
  timestamps: true
});

applyEnterprisePlugins(organizationRequestSchema, { tenant: false, publicPrefix: "ORGREQ" });
module.exports = mongoose.model('OrganizationRequest', organizationRequestSchema);
