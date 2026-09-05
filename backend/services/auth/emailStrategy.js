const bcrypt = require("bcrypt");
const User = require("../../models/User");
const { AppError } = require("../../utils/errors");

const EmailStrategy = {
  authenticate: async (credentials) => {
    const { email } = credentials;
    if (!email) throw new AppError("Email required", 400);

    const normalizedEmail = email.toLowerCase().trim();
    // Using skipTenantGuard in case we run in a context wrapper, though we are currently at entry point
    let user = await User.findOne({
      $or: [{ email: normalizedEmail }, { phone: normalizedEmail }]
    }).setOptions({ skipTenantGuard: true });
    
    // Super Admin Auto-Create/Promote Logic
    if (normalizedEmail === process.env.SUPER_ADMIN_EMAIL?.toLowerCase()) {
      if (!user) {
        // Auto-create super admin if doesn't exist
        user = new User({
          name: process.env.SUPER_ADMIN_NAME || "Super Admin",
          email: process.env.SUPER_ADMIN_EMAIL,
          passwordHash: await bcrypt.hash(process.env.SUPER_ADMIN_PASSWORD || "admin123", 10),
          isSuperAdmin: true,
          role: "SUPER_ADMIN",
          status: "active"
        });
        await user.save();
      } else {
        // Auto-promote existing user
        let changed = false;
        if (!user.isSuperAdmin || user.role !== "SUPER_ADMIN") {
          user.isSuperAdmin = true;
          user.role = "SUPER_ADMIN";
          changed = true;
        }
        if (user.status !== "active") {
          user.status = "active";
          changed = true;
        }
        if (changed) await user.save();
      }
    }

    if (!user) throw new AppError("Invalid credentials", 401);
    
    // Enforce email login only for specific roles?
    // User role check is usually by roleId now, but if we need a quick check:
    if (!user.isSuperAdmin && !user.roleId) {
      // In V3, Admins/Owners have Roles just like cashiers.
      // The requirement was: Email is for Owner/Admin.
      // We will let Permissions handle this post-login, or verify here if needed.
    }

    return { user };
  },

  verify: async (user, credentials) => {
    const { password } = credentials;
    const hash = user.passwordHash || user.password;
    if (!password || !hash) return false;
    return await bcrypt.compare(password, hash);
  }
};

module.exports = EmailStrategy;

const authService = require('./authService');
authService.registerStrategy("EMAIL", EmailStrategy);
