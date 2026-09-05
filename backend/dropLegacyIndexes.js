require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * Drops legacy/stale indexes from MongoDB collections.
 * Also patches existing documents that have code: null to prevent
 * future unique index violations.
 *
 * Run this ONCE against production after deploying the updated code.
 * Usage:  MONGODB_URI=<uri> node dropLegacyIndexes.js
 */
async function dropIndexes() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tijaratpro');
  console.log('✅ Connected to MongoDB\n');

  // ─── Step 1: Drop legacy indexes ─────────────────────────────────────────
  const indexDropList = {
    'organizations':       ['publicId_1', 'code_1', 'uuid_1'],
    'branches':            ['publicId_1', 'code_1', 'uuid_1'],
    'organizationmembers': ['publicId_1', 'code_1', 'uuid_1'],
    'subscriptions':       ['publicId_1', 'code_1', 'uuid_1'],
    'users':               ['publicId_1', 'code_1', 'uuid_1'],
  };

  console.log('── Step 1: Dropping legacy indexes ──────────────────────────');
  for (const [collName, indexes] of Object.entries(indexDropList)) {
    const collection = mongoose.connection.collection(collName);
    for (const indexName of indexes) {
      try {
        await collection.dropIndex(indexName);
        console.log(`  ✅ Dropped "${indexName}" from "${collName}"`);
      } catch (err) {
        if (err.codeName === 'IndexNotFound' || err.code === 27) {
          console.log(`  ⚠️  "${indexName}" not found on "${collName}" (already dropped or never existed)`);
        } else {
          console.error(`  ❌ Failed to drop "${indexName}" from "${collName}": ${err.message}`);
        }
      }
    }
  }

  // ─── Step 2: Patch existing organizations with code: null ─────────────────
  console.log('\n── Step 2: Patching organizations with missing code ──────────');
  const orgs = mongoose.connection.collection('organizations');
  const nullCodeOrgs = await orgs.find({ $or: [{ code: null }, { code: { $exists: false } }] }).toArray();

  if (nullCodeOrgs.length === 0) {
    console.log('  ✅ No organizations with null code found — nothing to patch.');
  } else {
    console.log(`  Found ${nullCodeOrgs.length} organization(s) with null/missing code. Patching...`);
    for (const org of nullCodeOrgs) {
      const newCode = `ORG-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      await orgs.updateOne({ _id: org._id }, { $set: { code: newCode } });
      console.log(`  ✅ Patched org "${org.name || org._id}" → code: ${newCode}`);
    }
  }

  // ─── Step 3: Patch existing branches with code: null ──────────────────────
  console.log('\n── Step 3: Patching branches with missing code ───────────────');
  const branches = mongoose.connection.collection('branches');
  const nullCodeBranches = await branches.find({ $or: [{ code: null }, { code: { $exists: false } }] }).toArray();

  if (nullCodeBranches.length === 0) {
    console.log('  ✅ No branches with null code found — nothing to patch.');
  } else {
    console.log(`  Found ${nullCodeBranches.length} branch(es) with null/missing code. Patching...`);
    for (const branch of nullCodeBranches) {
      const newCode = `BR-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      await branches.updateOne({ _id: branch._id }, { $set: { code: newCode } });
      console.log(`  ✅ Patched branch "${branch.name || branch._id}" → code: ${newCode}`);
    }
  }

  await mongoose.disconnect();
  console.log('\n✅ Done. Disconnected from MongoDB.');
}

dropIndexes().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
