const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      index: true,
    },
    shopName: {
      type: String,
      required: [true, 'Shop name is required'],
      trim: true,
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true,
    },
    businessType: {
      type: String,
      required: [true, 'Business type is required'],
      trim: true,
    },
    status: {
      type: String,
      enum: ['new', 'contacted', 'demo_scheduled', 'converted', 'rejected'],
      default: 'new',
      index: true,
    }
  },
  {
    timestamps: true,
  }
);

// Indexing for search
leadSchema.index({ name: 'text', shopName: 'text', phone: 'text' });

const Lead = mongoose.model('Lead', leadSchema);

module.exports = Lead;
