const crypto = require("crypto");
const mongoose = require('mongoose');

const Organization = require('../models/Organization');
const Branch = require('../models/Branch');
const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');
const License = require('../models/License');

const ConfigurationService = require('../services/config/configurationService');
const FeatureService = require('../services/config/featureService');
const { tenantContext } = require('../middleware/context/asyncContext');

async function verify() {
  console.log('Connecting to Test Database...');
  await mongoose.connect('mongodb://127.0.0.1:27017/tijaratpro_phase5_test');
  await mongoose.connection.dropDatabase();
  await Promise.all(mongoose.modelNames().map(m => mongoose.model(m).createIndexes()));
  console.log('✅ Database connected and cleared, indexes rebuilt.');

  const userId = crypto.randomUUID();

  const org1 = await Organization.create({ name: 'Org 1', code: 'ORG1', ownerId: userId });
  const org2 = await Organization.create({ name: 'Org 2', code: 'ORG2', ownerId: userId });
  
  const branch1 = await Branch.create({ name: 'Branch 1', organizationId: org1._id });

  // Add the tenant context
  await tenantContext.run({ organizationId: org1._id.toString() }, async () => {
    console.log('\n--- Running Phase 5 Verification ---');

    // 1. & 9. Default values for new organizations & Org Settings load/save
    const defaultSecurity = await ConfigurationService.getSecuritySettings(org1._id);
    if (!defaultSecurity) throw new Error("Failed to auto-create default security settings");
    if (defaultSecurity.passwordPolicy.minLength !== 8) throw new Error("Defaults incorrect");
    console.log('✅ Default values for new organizations loaded.');

    const updatedSecurity = await ConfigurationService.updateSecuritySettings(org1._id, {
      "passwordPolicy.minLength": 12
    });
    if (updatedSecurity.passwordPolicy.minLength !== 12) throw new Error("Failed to save settings");
    console.log('✅ Organization settings load/save verified.');

    // 8. Settings cache invalidation
    // It should hit cache on get
    const cachedSecurity = await ConfigurationService.getSecuritySettings(org1._id);
    if (cachedSecurity.passwordPolicy.minLength !== 12) throw new Error("Cache gave wrong data");

    // Manually update in DB
    const SecuritySettings = require('../models/SecuritySettings');
    await SecuritySettings.updateOne({ organizationId: org1._id }, { $set: { "passwordPolicy.minLength": 10 } });

    // Fetch again (should be 12 because of cache)
    const staleCache = await ConfigurationService.getSecuritySettings(org1._id);
    if (staleCache.passwordPolicy.minLength !== 12) throw new Error("Cache is missing");

    // Invalidate and refetch
    ConfigurationService.invalidateCache(org1._id, 'Security');
    const freshCache = await ConfigurationService.getSecuritySettings(org1._id);
    if (freshCache.passwordPolicy.minLength !== 10) throw new Error("Cache invalidation failed");
    console.log('✅ Settings cache invalidation verified.');

    // 2. Branch overrides
    const branchSettings = await ConfigurationService.getBranchSettings(org1._id, branch1._id);
    if (!branchSettings) throw new Error("Branch defaults missing");
    
    await ConfigurationService.updateBranchSettings(org1._id, branch1._id, { invoicePrefix: "BR1-" });
    const bSettings = await ConfigurationService.getBranchSettings(org1._id, branch1._id);
    if (bSettings.invoicePrefix !== "BR1-") throw new Error("Branch override failed");
    console.log('✅ Branch overrides verified.');

    // 3. Plan limits & 6. Feature enable/disable
    const premiumPlan = await Plan.create({
      name: "Premium",
      price: 99,
      features: { inventory: true, payroll: true, crm: false }
    });

    const sub = await Subscription.create({
      organizationId: org1._id,
      planId: premiumPlan._id,
      status: "ACTIVE",
      startDate: new Date()
    });

    let canInventory = await FeatureService.canUse(org1._id, "inventory");
    let canCRM = await FeatureService.canUse(org1._id, "crm");

    if (!canInventory) throw new Error("Feature allow check failed");
    if (canCRM) throw new Error("Feature deny check failed");
    console.log('✅ Plan limits and Feature enable/disable verified.');

    // 4. Subscription expiry (Simulate cancellation/expiry)
    sub.status = "CANCELED";
    await sub.save();
    FeatureService.invalidateCache(org1._id);

    let canInventoryAfterCancel = await FeatureService.canUse(org1._id, "inventory");
    if (canInventoryAfterCancel) throw new Error("Feature should be disabled on cancelled sub");
    console.log('✅ Subscription expiry handling verified.');

    // 5. License validation (Offline/Enterprise backup)
    const license = await License.create({
      organizationId: org1._id,
      licenseKey: "1234-5678-ABCD",
      type: "ENTERPRISE",
      expiresAt: new Date(Date.now() + 86400000), // Tomorrow
      metadata: { features: { inventory: true, payroll: true, crm: true } }
    });
    
    FeatureService.invalidateCache(org1._id);
    let canCRMWithLicense = await FeatureService.canUse(org1._id, "crm");
    if (!canCRMWithLicense) throw new Error("Offline License validation failed");
    console.log('✅ Offline License validation verified.');
  });

  // 7. Organization isolation
  await tenantContext.run({ organizationId: org2._id.toString() }, async () => {
    const org2Security = await ConfigurationService.getSecuritySettings(org2._id);
    if (org2Security.passwordPolicy.minLength !== 8) throw new Error("Tenant leakage in settings");
    
    const canInvOrg2 = await FeatureService.canUse(org2._id, "inventory");
    if (canInvOrg2) throw new Error("Tenant leakage in features");
    console.log('✅ Multi-organization isolation verified.');
  });

  console.log('\n🎉 Phase 5 Verification Complete: Settings & Config Services Passed!');
  process.exit(0);
}

verify().catch(e => {
  console.error('❌ Verification failed', e);
  process.exit(1);
});
