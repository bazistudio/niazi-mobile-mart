const bcrypt = require("bcrypt");
const User = require("../../models/User");
const Organization = require("../../models/Organization");

const PinStrategy = {
  authenticate: async (credentials) => {
    const { organizationCode, username } = credentials;
    if (!organizationCode || !username) throw new Error("Organization Code and Username required");

    // Resolve Organization by Code
    const org = await Organization.findOne({ code: organizationCode.toUpperCase().trim() }).setOptions({ skipTenantGuard: true });
    if (!org) throw new Error("Invalid credentials");

    // Resolve User by Org + Username
    const user = await User.findOne({ 
      organizationId: org._id, 
      username: username.toLowerCase().trim() 
    }).setOptions({ skipTenantGuard: true });
    
    if (!user) throw new Error("Invalid credentials");
    
    return { user };
  },

  verify: async (user, credentials) => {
    const { pin } = credentials;
    if (!pin) return false;
    if (!user.pinEnabled || !user.pinHash) return false;
    
    return await bcrypt.compare(pin, user.pinHash);
  }
};

module.exports = PinStrategy;
