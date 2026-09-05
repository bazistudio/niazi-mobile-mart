const mongoose = require('mongoose');
const crypto = require('crypto');
const MigrationRunner = require('./migration-runner');
const MigrationHistory = require('../models/MigrationHistory');
const Organization = require('../models/Organization');
const Branch = require('../models/Branch');
const User = require('../models/User');

process.env.NO_TRANSACTIONS = '1';

async function setupLegacyData(db) {
  const tenantId = crypto.randomUUID();
  const shopId = crypto.randomUUID();
  const userId = crypto.randomUUID();

  await db.collection('tenants').insertOne({
    _id: tenantId,
    name: "Legacy Corp",
    code: "LEG",
    ownerId: userId,
    createdAt: new Date()
  });

  await db.collection('shops').insertOne({
    _id: shopId,
    name: "Legacy Shop",
    tenantId: tenantId,
    createdAt: new Date()
  });

  await db.collection('users').insertOne({
    _id: userId,
    username: "legacyuser",
    name: "Legacy User",
    tenantId: tenantId,
    shopId: shopId
  });

  return { tenantId, shopId, userId };
}

async function verify() {
  console.log('Connecting to Test Database...');
  await mongoose.connect('mongodb://127.0.0.1:27017/tijaratpro_phase8_test');
  await mongoose.connection.dropDatabase();
  await Promise.all(mongoose.modelNames().map(m => mongoose.model(m).createIndexes()));
  console.log('✅ Database connected and cleared, indexes rebuilt.');

  const db = mongoose.connection.db;
  const { tenantId, shopId, userId } = await setupLegacyData(db);

  console.log('\n--- Running Phase 8 Verification ---');

  // 1. Dry Run Mode
  await MigrationRunner.runMigrations(true);
  const orgCountDry = await db.collection('organizations').countDocuments();
  if (orgCountDry > 0) throw new Error("Dry-run failed: modified database.");
  console.log('✅ Dry-run mode works verified.');

  // 2. Execute Migration
  await MigrationRunner.runMigrations(false);
  console.log('✅ Migration executes successfully verified.');

  // 3. Verify Mapping and Data Integrity
  const org = await db.collection('organizations').findOne({ _id: tenantId });
  if (!org || org.name !== "Legacy Corp") throw new Error("Tenant -> Organization mapping failed");
  if (!org.publicId || !org.uuid) throw new Error("PublicId and UUID generation failed for Org");
  console.log('✅ Legacy Tenant -> Organization mapping verified.');
  console.log('✅ PublicId generated and UUID preserved verified.');

  const branch = await db.collection('branches').findOne({ _id: shopId });
  if (!branch || branch.organizationId.toString() !== tenantId.toString()) throw new Error("Shop -> Branch mapping failed");
  console.log('✅ Legacy Shop -> Branch mapping verified.');

  const mappedUser = await db.collection('users').findOne({ _id: userId });
  if (!mappedUser.organizationId || mappedUser.organizationId.toString() !== tenantId.toString()) throw new Error("User tenant mapping failed");
  console.log('✅ Data integrity verified (User mapped).');

  // 4. MigrationHistory updated
  const history = await MigrationHistory.findOne({ migrationId: "20260626000000-legacy-mapping" });
  if (!history || history.status !== "SUCCESS") throw new Error("MigrationHistory not updated correctly");
  console.log('✅ MigrationHistory updated verified.');

  // 5. Rollback executes successfully
  await MigrationRunner.rollbackMigration("20260626000000-legacy-mapping");
  const orgCountAfterRollback = await db.collection('organizations').countDocuments();
  if (orgCountAfterRollback !== 0) throw new Error("Rollback failed to remove organizations");
  
  const rolledBackHistory = await MigrationHistory.findOne({ migrationId: "20260626000000-legacy-mapping" });
  if (rolledBackHistory.status !== "ROLLED_BACK") throw new Error("MigrationHistory status not updated after rollback");
  console.log('✅ Rollback executes successfully verified.');

  console.log('\n🎉 Phase 8 Verification Complete: Migration System Passed!');
  process.exit(0);
}

verify().catch(e => {
  console.error('❌ Verification failed', e);
  process.exit(1);
});
