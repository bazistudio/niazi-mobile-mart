const mongoose = require('mongoose');
const seedRoles = require('./seeders/roleSeeder');
const seedPermissions = require('./seeders/permissionSeeder');
const seedRolePermissions = require('./seeders/rolePermissionSeeder');
const seedFeatures = require('./seeders/featureSeeder');
const seedSubscriptionPlans = require('./seeders/subscriptionSeeder');
const seedSuperAdmin = require('./seeders/superAdminSeeder');
const seedSystemConfig = require('./seeders/systemConfigSeeder');

async function bootstrapDatabase() {
  console.log('\n=========================================');
  console.log('   TijaratPro V4 Database Bootstrap   ');
  console.log('=========================================\n');

  try {
    // 1. Ensure DB connection is active
    if (mongoose.connection.readyState !== 1) {
      throw new Error('MongoDB is not connected. Call connectDB() before bootstrap.');
    }
    console.log('✓ MongoDB Connected');

    // 2. Sync Indexes
    // Get all registered models
    const models = mongoose.modelNames();
    for (const modelName of models) {
      await mongoose.model(modelName).syncIndexes();
    }
    console.log('✓ Indexes Synced\n');

    console.log('Seed Summary');
    console.log('-------------');

    // 3. Seed Data
    const rolesCount = await seedRoles();
    console.log(`✓ Roles: OK (${rolesCount > 0 ? `Created ${rolesCount}` : 'Already exists'})`);

    const permsCount = await seedPermissions();
    console.log(`✓ Permissions: OK (${permsCount > 0 ? `Created ${permsCount}` : 'Already exists'})`);

    const rolePermsCount = await seedRolePermissions();
    console.log(`✓ Role Permissions: OK (${rolePermsCount > 0 ? `Created ${rolePermsCount}` : 'Already exists'})`);

    const featuresCount = await seedFeatures();
    console.log(`✓ Features: OK (${featuresCount > 0 ? `Created ${featuresCount}` : 'Already exists'})`);

    const subsCount = await seedSubscriptionPlans();
    console.log(`✓ Subscription Plans: OK (${subsCount > 0 ? `Created ${subsCount}` : 'Already exists'})`);

    const sysCount = await seedSystemConfig();
    console.log(`✓ System Config: OK (${sysCount > 0 ? 'Created' : 'Already exists'})`);

    const adminCount = await seedSuperAdmin();
    console.log(`✓ Super Admin: OK (${adminCount > 0 ? 'Created' : 'Already exists'})`);

    console.log('\nSystem Ready\n');

  } catch (error) {
    console.error('\n[FATAL] Bootstrap failed:');
    console.error(error);
    console.error('\nExiting process to prevent partially initialized state.');
    process.exit(1);
  }
}

module.exports = bootstrapDatabase;
