const Role = require('../../models/Role');
const Permission = require('../../models/Permission');
const RolePermission = require('../../models/RolePermission');

async function seedRolePermissions() {
  let mappedCount = 0;

  // 1. Get all roles and permissions
  const roles = await Role.find({}).setOptions({ skipTenantGuard: true });
  const permissions = await Permission.find({}).setOptions({ skipTenantGuard: true });

  const roleMap = roles.reduce((acc, role) => {
    acc[role.name] = role;
    return acc;
  }, {});

  const permMap = permissions.reduce((acc, perm) => {
    acc[perm.key] = perm;
    return acc;
  }, {});

  // 2. Define mappings
  const mappings = {
    'SUPER_ADMIN': Object.keys(permMap), // All permissions
    'ORGANIZATION_OWNER': Object.keys(permMap), // All permissions (organization scoped)
    'ADMIN': Object.keys(permMap).filter(k => !k.startsWith('settings.')), // All except global settings
    'MANAGER': Object.keys(permMap).filter(k => 
      ['products.read', 'products.create', 'products.update', 'orders.read', 'orders.create', 'inventory.read', 'inventory.update', 'customers.read', 'customers.create', 'pos.access', 'reports.read'].includes(k)
    ),
    'CASHIER': ['orders.create', 'orders.read', 'customers.read', 'pos.access'],
    'STAFF': ['products.read', 'inventory.read', 'orders.read']
  };

  // 3. Apply mappings idempotently
  for (const [roleName, permKeys] of Object.entries(mappings)) {
    const role = roleMap[roleName];
    if (!role) continue;

    for (const key of permKeys) {
      const perm = permMap[key];
      if (!perm) continue;

      const existing = await RolePermission.findOne({ roleId: role._id, permissionId: perm._id }).setOptions({ skipTenantGuard: true });
      if (!existing) {
        await RolePermission.create({ roleId: role._id, permissionId: perm._id });
        mappedCount++;
      }
    }
  }

  return mappedCount;
}

module.exports = seedRolePermissions;
