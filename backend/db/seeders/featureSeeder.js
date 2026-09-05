const FeatureDefinition = require('../../models/FeatureDefinition');

const features = [
  { name: 'INVENTORY', description: 'Core inventory management', category: 'CORE' },
  { name: 'POS', description: 'Point of sale operations', category: 'CORE' },
  { name: 'MANUFACTURING', description: 'Manufacturing and assembly', category: 'ADDON' },
  { name: 'HR', description: 'Human resources and payroll', category: 'PREMIUM' },
  { name: 'REPORTS', description: 'Advanced reporting and analytics', category: 'CORE' }
];

async function seedFeatures() {
  let createdCount = 0;
  for (const f of features) {
    const existing = await FeatureDefinition.findOne({ name: f.name }).setOptions({ skipTenantGuard: true });
    if (!existing) {
      await FeatureDefinition.create(f);
      createdCount++;
    }
  }
  return createdCount;
}

module.exports = seedFeatures;
