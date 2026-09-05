const Permission = require('../../models/Permission');

const modules = ['products', 'orders', 'inventory', 'customers', 'suppliers', 'settings', 'reports', 'users', 'branches'];
const actions = ['read', 'create', 'update', 'delete'];

async function seedPermissions() {
  let createdCount = 0;
  
  for (const mod of modules) {
    for (const act of actions) {
      const key = `${mod}.${act}`;
      const existing = await Permission.findOne({ key }).setOptions({ skipTenantGuard: true });
      if (!existing) {
        await Permission.create({
          key,
          module: mod,
          action: act,
          description: `Can ${act} ${mod}`
        });
        createdCount++;
      }
    }
  }
  
  // Specific permissions
  const extraPermissions = [
    { key: 'pos.access', module: 'pos', action: 'access', description: 'Can access POS' },
    { key: 'reports.view_financials', module: 'reports', action: 'read', description: 'Can view financial reports' }
  ];
  
  for (const perm of extraPermissions) {
    const existing = await Permission.findOne({ key: perm.key }).setOptions({ skipTenantGuard: true });
    if (!existing) {
      await Permission.create(perm);
      createdCount++;
    }
  }

  return createdCount;
}

module.exports = seedPermissions;
