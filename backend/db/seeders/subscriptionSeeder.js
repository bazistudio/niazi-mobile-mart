const Package = require('../../models/Package');

const packages = [
  {
    name: 'Free Trial',
    code: 'FREE',
    description: '15-Day Free Trial for evaluation.',
    durationType: 'DAYS',
    durationValue: 15,
    isTrial: true,
    status: 'ACTIVE',
    maxBranches: 1,
    maxUsers: 2,
    maxProducts: 50,
    enabledModules: ['SALES', 'INVENTORY']
  },
  {
    name: 'Standard Monthly',
    code: 'STD_MONTH',
    description: 'Standard monthly subscription for small businesses.',
    durationType: 'MONTHS',
    durationValue: 1,
    isTrial: false,
    status: 'ACTIVE',
    maxBranches: 2,
    maxUsers: 5,
    maxProducts: 500,
    enabledModules: ['SALES', 'INVENTORY', 'PURCHASE', 'EXPENSE']
  },
  {
    name: 'Enterprise Yearly',
    code: 'ENT_YEAR',
    description: 'Enterprise yearly subscription with full features.',
    durationType: 'YEARS',
    durationValue: 1,
    isTrial: false,
    status: 'ACTIVE',
    maxBranches: 10,
    maxUsers: 20,
    maxProducts: 5000,
    enabledModules: ['SALES', 'INVENTORY', 'PURCHASE', 'EXPENSE', 'REPORTS', 'HR']
  }
];

async function seedSubscriptionPlans() {
  let createdCount = 0;
  for (const pkg of packages) {
    const existing = await Package.findOne({ code: pkg.code }).setOptions({ skipTenantGuard: true });
    if (!existing) {
      await Package.create(pkg);
      createdCount++;
    }
  }
  return createdCount;
}

module.exports = seedSubscriptionPlans;
