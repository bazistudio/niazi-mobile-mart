const mongoose = require('mongoose');

const subscriptionPlanSchema = new mongoose.Schema({
  name: { type: String, required: true }, // e.g. 'Basic', 'Premium', 'Enterprise'
  code: { type: String, required: true, unique: true }, // e.g. 'BASIC', 'PREMIUM'
  description: { type: String },
  price: { type: Number, required: true },
  currency: { type: String, default: 'PKR' },
  features: [{ type: String, ref: 'FeatureDefinition' }], // Included features
  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

module.exports = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);
