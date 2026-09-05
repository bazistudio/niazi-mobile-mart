/**
 * One-Time Seed Script: Default Roles for Existing Organizations
 *
 * Seeds the 6 default system roles for any organization that currently has 0 roles.
 * Skips organizations that already have roles (fully idempotent).
 *
 * Uses Model.create() instead of insertMany() so that Mongoose pre-save
 * middleware (publicId generation) runs correctly.
 *
 * Usage:
 *   node scripts/seed-existing-organization-roles.js
 *
 * Prerequisites:
 *   - Run migrations/seed-role-access-system.js first so permissions exist.
 *   - MONGODB_URI must be set in .env
 */
require('dotenv').config();

const { connectDB } = require('../db/connection');
const Organization = require('../models/Organization');
const Role = require('../models/Role');
const RolePermission = require('../models/RolePermission');
const Permission = require('../models/Permission');
const { DEFAULT_ROLE_TEMPLATES } = require('../config/permissions');

async function seedRolesForOrg(org, allPermissions) {
  const orgId = org._id;
  const permMap = new Map(allPermissions.map((p) => [p.key, p._id]));

  let created = 0;
  let skipped = 0;
  const errors = [];

  for (const template of DEFAULT_ROLE_TEMPLATES) {
    try {
      // Idempotent check
      const existing = await Role.findOne({ name: template.name, organizationId: orgId })
        .setOptions({ skipTenantGuard: true })
        .lean();

      if (existing) {
        skipped++;
        continue;
      }

      // Create Role (triggers publicId pre-save hook)
      const role = new Role({
        name: template.name,
        description: template.description,
        organizationId: orgId,
        isSystem: template.isSystem,
        permissions: [],
      });
      await role.save();

      // Create RolePermission entries one-by-one so publicId hook fires per document
      const permissionKeys = [];
      for (const key of (template.permissions || [])) {
        const permId = permMap.get(key);
        if (!permId) continue;

        const rp = new RolePermission({ roleId: role._id, permissionId: permId });
        await rp.save();
        permissionKeys.push(key);
      }

      // Sync cache: write resolved keys back to Role.permissions[]
      await Role.findByIdAndUpdate(role._id, { permissions: permissionKeys })
        .setOptions({ skipTenantGuard: true });

      console.log(`  [OK] "${template.name}" — ${permissionKeys.length} permissions`);
      created++;
    } catch (err) {
      console.error(`  [ERR] "${template.name}": ${err.message}`);
      errors.push({ role: template.name, error: err.message });
    }
  }

  return { created, skipped, errors };
}

async function main() {
  try {
    console.log('[SEED] Connecting to MongoDB...');
    await connectDB();
    console.log('[SEED] Connected.\n');

    // Fetch all permissions once (global library)
    const allPermissions = await Permission.find({})
      .setOptions({ skipTenantGuard: true })
      .lean();

    if (allPermissions.length === 0) {
      console.error('[ERROR] No permissions found. Run migrations/seed-role-access-system.js first.');
      process.exit(1);
    }
    console.log(`[SEED] ${allPermissions.length} permissions loaded from database.\n`);

    // Find all active organizations
    const organizations = await Organization.find({ isDeleted: { $ne: true } })
      .setOptions({ skipTenantGuard: true })
      .lean();

    console.log(`[SEED] Found ${organizations.length} organization(s) to check.\n`);

    let totalSeeded = 0;
    let totalSkipped = 0;
    const orgErrors = [];

    for (const org of organizations) {
      const orgName = org.name || String(org._id);

      // Check if org already has roles
      const existingCount = await Role.countDocuments({
        organizationId: org._id,
        isDeleted: { $ne: true },
      }).setOptions({ skipTenantGuard: true });

      if (existingCount > 0) {
        console.log(`[SKIP] "${orgName}" — already has ${existingCount} role(s).`);
        totalSkipped++;
        continue;
      }

      console.log(`[SEED] "${orgName}"...`);
      try {
        const result = await seedRolesForOrg(org, allPermissions);
        const status = result.errors.length > 0 ? 'PARTIAL' : 'DONE';
        console.log(`[${status}] created: ${result.created}, skipped: ${result.skipped}, errors: ${result.errors.length}\n`);
        totalSeeded++;
      } catch (err) {
        console.error(`[ERROR] "${orgName}" — ${err.message}\n`);
        orgErrors.push({ org: orgName, error: err.message });
      }
    }

    console.log('========================================');
    console.log('  SEED SUMMARY');
    console.log('========================================');
    console.log(`  Total organizations : ${organizations.length}`);
    console.log(`  Seeded              : ${totalSeeded}`);
    console.log(`  Skipped (had roles) : ${totalSkipped}`);
    console.log(`  Fatal errors        : ${orgErrors.length}`);
    if (orgErrors.length > 0) {
      console.log('  Details:', JSON.stringify(orgErrors, null, 2));
    }
    console.log('========================================\n');

    process.exit(0);
  } catch (err) {
    console.error('[FATAL]', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
