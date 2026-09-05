const User = require('../models/User');
const bcrypt = require('bcrypt');
const { runInSystemContext } = require('./context/asyncContext');

module.exports = async (req, res, next) => {
  try {
    const adminPassword = req.body.adminPassword || req.query.adminPassword;
    
    if (!adminPassword) {
      return res.status(401).json({ success: false, message: "Super admin password is required for this action" });
    }

    const user = await runInSystemContext(async () => {
      return await User.findById(req.user._id).select('+passwordHash').lean();
    });

    if (!user || !user.passwordHash) {
      return res.status(401).json({ success: false, message: "User not found or no password set" });
    }

    const isMatch = await bcrypt.compare(adminPassword, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid super admin password" });
    }

    next();
  } catch (error) {
    console.error("requireAdminPassword Error:", error);
    return res.status(500).json({ success: false, message: "Internal server error during password verification" });
  }
};
