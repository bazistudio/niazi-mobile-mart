const mongoose = require('mongoose');

const VisibilityPolicySchema = new mongoose.Schema({
  canShowPrice: { type: Boolean, default: false },
  canShowAvailability: { type: Boolean, default: false },
  canShowShop: { type: Boolean, default: false },
  canShowPhone: { type: Boolean, default: false },
  canShowLocation: { type: Boolean, default: false },
  canShowImages: { type: Boolean, default: false },
  canShowWarranty: { type: Boolean, default: false }
}, { _id: false });

module.exports = VisibilityPolicySchema;
