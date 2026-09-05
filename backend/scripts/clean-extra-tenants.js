require('mongoose').connect('mongodb://127.0.0.1:27017/tijaratpro').then(async () => {
  const Tenant = require('../models/Tenant');
  const User = require('../models/User');
  
  const superAdmin = await User.findOne({ role: 'SUPER_ADMIN' }).populate('tenantId');
  if (!superAdmin) {
    console.log('No Super Admin found!');
    process.exit(1);
  }
  
  const keepTenantId = superAdmin.tenantId ? superAdmin.tenantId._id : null;
  console.log('Keeping tenant:', superAdmin.tenantId ? superAdmin.tenantId.name : 'None');
  
  const deleteTenants = await Tenant.find({ _id: { $ne: keepTenantId } });
  const deleteIds = deleteTenants.map(t => t._id);
  
  const userDeleteResult = await User.deleteMany({ tenantId: { $in: deleteIds } });
  const tenantDeleteResult = await Tenant.deleteMany({ _id: { $in: deleteIds } });
  
  console.log(`Deleted ${tenantDeleteResult.deletedCount} extra tenants.`);
  console.log(`Deleted ${userDeleteResult.deletedCount} extra users.`);
  
  process.exit(0);
}).catch(console.error);
