const mongoose = require('mongoose');

mongoose.connect('mongodb://127.0.0.1:27017/tijaratpro').then(async () => {
  try {
    const Organization = require('../models/Organization');
    const Subscription = require('../models/Subscription');
    
    const orgs = await Organization.find({}).lean();
    console.log(`Found ${orgs.length} organizations.`);
    
    for (const org of orgs) {
      let sub = await Subscription.findOne({ organizationId: org._id });
      if (!sub) {
        sub = new Subscription({
          organizationId: org._id,
          planId: 'default-legacy-plan',
          paymentStatus: 'PAID',
          startsAt: new Date(),
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
          autoRenew: true
        });
        await sub.save();
      }
    }
    console.log(`Successfully created subscriptions for ${orgs.length} organizations.`);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
});
