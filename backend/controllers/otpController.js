const jwt = require("jsonwebtoken");
const { otpService } = require("../container");

// @desc    Send Dual OTP
// @route   POST /api/auth/send-otp
// @access  Public
exports.sendOtp = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ message: "Phone number is required" });
    }

    await otpService.createDualOtp(phone);

    res.status(200).json({
      success: true,
      message: "OTP sent successfully"
    });

  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Send OTP Error:', error);
    res.status(500).json({ success: false, message: "Server error sending OTP" });
  }
};

// @desc    Verify Dual OTP & Login
// @route   POST /api/auth/verify-otp
// @access  Public
exports.verifyOtp = async (req, res) => {
  try {
    const { phone, userOtp, adminOtp } = req.body;

    if (!phone || !userOtp || !adminOtp) {
      return res.status(400).json({ message: "Phone, userOtp, and adminOtp are all required" });
    }

    const user = await otpService.verifyDualOtp(phone, userOtp, adminOtp);

    const token = jwt.sign(
      {
        _id: user._id,
        role: user.role,
        shopId: user.shopId || null,
        tenantId: user.tenantId ? user.tenantId._id : null,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );
    
    // Set cookie for frontend middleware
    res.cookie("tp_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    
    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        shopId: user.shopId,
      },
    });

  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Verify OTP Error:', error);
    res.status(500).json({ success: false, message: "Server error verifying OTP" });
  }
};
