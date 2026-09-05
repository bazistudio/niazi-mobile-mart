const Role = require('../../models/Role');

const roles = [
  { name: 'SUPER_ADMIN', description: 'System super administrator', isSystem: true },
  { name: 'ORGANIZATION_OWNER', description: 'Owner of the organization', isSystem: true },
  { name: 'ADMIN', description: 'Administrator for an organization', isSystem: true },
  { name: 'MANAGER', description: 'Manager for branches', isSystem: true },
  { name: 'CASHIER', description: 'Cashier at a branch', isSystem: true },
  { name: 'STAFF', description: 'General staff member', isSystem: true }
];

async function seedRoles() {
  let createdCount = 0;
  for (const r of roles) {
    const existing = await Role.findOne({ name: r.name, organizationId: { $exists: false } }).setOptions({ skipTenantGuard: true });
    if (!existing) {
      await Role.create({ ...r });
      createdCount++;
    }
  }
  return createdCount;
}

module.exports = seedRoles;
