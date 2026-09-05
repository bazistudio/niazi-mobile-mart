const User = require('../../models/User');
const Role = require('../../models/Role');
const bcrypt = require('bcrypt');

async function seedSuperAdmin() {
  const email = process.env.SUPER_ADMIN_EMAIL || 'admin@tijaratpro.com';
  const password = process.env.SUPER_ADMIN_PASSWORD || 'admin123';
  
  const existingAdmin = await User.findOne({ email }).setOptions({ skipTenantGuard: true });
  if (existingAdmin) {
    return 0; // Already seeded
  }

  const superAdminRole = await Role.findOne({ name: 'SUPER_ADMIN' }).setOptions({ skipTenantGuard: true });
  const roleId = superAdminRole ? superAdminRole._id : null;

  const hashedPassword = await bcrypt.hash(password, 10);
  
  await User.create({
    name: 'Super Admin',
    email: email,
    passwordHash: hashedPassword, // V4 field might be passwordHash
    plainPassword: password, // For dev only
    role: 'SUPER_ADMIN',
    roleId: roleId,
    status: 'active',
    isSuperAdmin: true,
    isVerified: true
  });

  return 1;
}

module.exports = seedSuperAdmin;
