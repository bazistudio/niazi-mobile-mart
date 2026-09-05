const { AppError } = require("../utils/errors");

class OtpService {
  constructor(userRepository, otpVerificationRepository) {
    this.userRepository = userRepository;
    this.otpVerificationRepository = otpVerificationRepository;
  }

  generateOtp() {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  // Abstracted SMS sending (assumes an external integration, mock for now)
  async sendSMS(phone, message) {
    console.log(`[Mock SMS] Sending to ${phone}: ${message}`);
  }

  async sendOTP(userPhone, userOtp, adminPhone, adminOtp) {
    await this.sendSMS(userPhone, `Your User OTP for login is ${userOtp}`);
    await this.sendSMS(adminPhone, `Admin verification required. Use OTP ${adminOtp} for the user logging in.`);
  }

  async createDualOtp(phone) {
    // Rate Limiting: Max 3 OTP requests within the 5 min expiration cycle
    const recentRequests = await this.otpVerificationRepository.count({ phone });
    if (recentRequests >= 3) {
      throw new AppError("Too many OTP requests. Try again later.", 429);
    }

    const user = await this.userRepository.findOne({ phone });
    if (!user) {
      throw new AppError("User not found", 404);
    }

    const shopId = user.shopId || user._id;

    // Find Shop Admin 
    const shopAdmin = await this.userRepository.findOne({
      $or: [
        { _id: shopId, role: "ADMIN" },
        { shopId: shopId, role: "ADMIN" }
      ]
    });

    if (!shopAdmin) {
       throw new AppError("Shop admin configuration incomplete.", 404);
    }

    const adminPhone = shopAdmin.phone;

    if (!adminPhone) {
      throw new AppError("Shop admin has no phone registered", 400);
    }

    const userOtp = this.generateOtp();
    const adminOtp = this.generateOtp();
    const expiresAt = new Date(Date.now() + 5 * 60000);

    await this.otpVerificationRepository.create({
      phone,
      userOtp,
      adminOtp,
      shopId,
      expiresAt
    });

    await this.sendOTP(phone, userOtp, adminPhone, adminOtp);
  }

  async verifyDualOtp(phone, userOtp, adminOtp) {
    const verification = await this.otpVerificationRepository.findOne({ phone, expiresAt: { $gt: new Date() } });

    if (!verification) {
      throw new AppError("OTP expired or invalid", 400);
    }

    if (verification.attempts >= 5) {
      throw new AppError("Too many failed attempts", 403);
    }

    if (verification.userOtp !== String(userOtp) || verification.adminOtp !== String(adminOtp)) {
      verification.attempts += 1;
      await this.otpVerificationRepository.updateById(verification._id, { attempts: verification.attempts });
      throw new AppError("Invalid OTP", 400);
    }

    await this.otpVerificationRepository.deleteById(verification._id); // Real deletion to prevent replay

    const user = await this.userRepository.findOne({ phone });

    if (!user) {
      throw new AppError("User no longer exists", 404);
    }

    return user;
  }
}

module.exports = OtpService;
