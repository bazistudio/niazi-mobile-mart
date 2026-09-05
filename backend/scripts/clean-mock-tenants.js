require('mongoose').connect('mongodb://127.0.0.1:27017/tijaratpro').then(async () => {
  const Tenant = require('../models/Tenant');
  const User = require('../models/User');
  const mockNames = ['Tenant A', 'Tenant B', 'Tenant Org', 'Test Tenant', 'Test Shop', 'Demo Store SaaS'];
  
  const tenantsToDelete = await Tenant.find({ name: { $in: mockNames } });
  const tenantIds = tenantsToDelete.map(t => t._id);
  
  const userDeleteResult = await User.deleteMany({ tenantId: { $in: tenantIds } });
  const tenantDeleteResult = await Tenant.deleteMany({ _id: { $in: tenantIds } });
  
  console.log(`Deleted ${tenantDeleteResult.deletedCount} mock tenants.`);
  console.log(`Deleted ${userDeleteResult.deletedCount} associated mock users.`);
  process.exit(0);
}).catch(console.error);
