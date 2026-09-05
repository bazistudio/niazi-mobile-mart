const mongoose = require('mongoose');

const otpVerificationSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: true,
      index: true,
    },
    userOtp: {
      type: String,
      required: true,
    },
    adminOtp: {
      type: String,
      required: true,
    },
    userVerified: {
      type: Boolean,
      default: false,
    },
    adminVerified: {
      type: Boolean,
      default: false,
    },
    shopId: {
      type: String,
      ref: 'User',
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 300 } // Auto-deletes 5 mins (300 secs) after this date
    },
    attempts: {
      type: Number,
      default: 0
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('OtpVerification', otpVerificationSchema);
