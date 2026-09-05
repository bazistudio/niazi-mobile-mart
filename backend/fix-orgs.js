const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/tijaratpro').then(async () => {
  const User = require('./models/User');
  const Brand = require('./models/Brand');
  const Color = require('./models/Color');
  const Company = require('./models/Company');
  const Quality = require('./models/Quality');
  
  const user = await User.findOne({ email: 'gulnaveed12@ymail.com' }).lean();
  const orgId = user.organizationId || user.tenantId || 'e1cd702c-d2fe-4536-a8ea-4bcbccc6447b'; // fallback to the one we saw on category
  console.log('Using OrgId:', orgId);
  
  if (orgId) {
    const b = await Brand.updateMany({ organizationId: { $exists: false } }, { $set: { organizationId: orgId } });
    const c = await Color.updateMany({ organizationId: { $exists: false } }, { $set: { organizationId: orgId } });
    const cp = await Company.updateMany({ organizationId: { $exists: false } }, { $set: { organizationId: orgId } });
    const q = await Quality.updateMany({ organizationId: { $exists: false } }, { $set: { organizationId: orgId } });
    console.log('Updated:', { brands: b.modifiedCount, colors: c.modifiedCount, companies: cp.modifiedCount, qualities: q.modifiedCount });
  }
  process.exit(0);
});
