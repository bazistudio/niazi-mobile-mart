/**
 * Seed Migration: Role & Access System
 *
 * Seeds the Permission collection with all permissions defined in the PERMISSION_REGISTRY.
 * This is idempotent — safe to run multiple times.
 *
 * Permissions are global (not organization-specific).
 * Role templates are defined in config/permissions.js but NOT materialized here.
 * Roles will be created per-organization by roleService.seedDefaultRolesForOrganization().
 *
 * Usage:
 *   node migrations/seed-role-access-system.js
 *
 * Architecture:
 * - Reuses existing MongoDB connection from db/connection.js
 * - Reuses Permission model from models/Permission.js
 * - Reuses PERMISSION_REGISTRY from config/permissions.js
 * - Does NOT create duplicate database connection logic
 */
require('dotenv').config();

const { connectDB } = require('../db/connection');
const Permission = require('../models/Permission');
const { PERMISSION_REGISTRY, DEFAULT_ROLE_TEMPLATES, MODULES, ACTIONS } = require('../config/permissions');

async function seedPermissions() {
  console.log('[SEED] Starting permission seeding...');
  console.log('[SEED] Total permissions in registry:', PERMISSION_REGISTRY.length);
  console.log('[SEED] Modules:', MODULES.join(', '));
  console.log('[SEED] Actions:', ACTIONS.join(', '));
  console.log('[SEED] Default role templates:', DEFAULT_ROLE_TEMPLATES.map(r => r.name).join(', '));

  let created = 0;
  let skipped = 0;
  const errors = [];

  for (const perm of PERMISSION_REGISTRY) {
    try {
      const existing = await Permission.findOne({ key: perm.key }).setOptions({ skipTenantGuard: true });

      if (existing) {
        skipped++;
        continue;
      }

      await Permission.create({
        key: perm.key,
        module: perm.module,
        action: perm.action,
        description: perm.description,
      });
      created++;
      console.log('[SEED] Created permission:', perm.key);
    } catch (err) {
      if (err.code === 11000) {
        skipped++;
      } else {
        errors.push({ key: perm.key, error: err.message });
        console.error('[SEED] Error creating permission:', perm.key, err.message);
      }
    }
  }

  console.log('');
  console.log('========================================');
  console.log('  PERMISSION SEED SUMMARY');
  console.log('========================================');
  console.log('  Total in registry:', PERMISSION_REGISTRY.length);
  console.log('  Created:', created);
  console.log('  Skipped (already exist):', skipped);
  console.log('  Errors:', errors.length);
  if (errors.length > 0) {
    console.log('  Error details:', JSON.stringify(errors, null, 2));
  }
  console.log('========================================');
  console.log('');

  return { created, skipped, errors };
}

async function verifyPermissions() {
  const count = await Permission.countDocuments().setOptions({ skipTenantGuard: true });
  console.log('[VERIFY] Total permissions in database:', count);
  console.log('[VERIFY] Expected from registry:', PERMISSION_REGISTRY.length);

  if (count === PERMISSION_REGISTRY.length) {
    console.log('[VERIFY] PASS: All permissions are present in the database');
  } else if (count > 0) {
    console.log('[VERIFY] PARTIAL: Some permissions exist. Run again to seed missing ones.');
  } else {
    console.log('[VERIFY] FAIL: No permissions found in database');
  }

  return count;
}

async function main() {
  try {
    console.log('[SEED] Connecting to MongoDB...');
    await connectDB();
    console.log('[SEED] MongoDB connected successfully.');
    console.log('');

    await seedPermissions();
    await verifyPermissions();

    console.log('');
    console.log('[SEED] Role templates available for per-organization seeding:');
    for (const template of DEFAULT_ROLE_TEMPLATES) {
      console.log('  -', template.name, '(' + template.permissions.length + ' permissions)');
    }
    console.log('');
    console.log('[SEED] NOTE: Role templates are definitions only.');
    console.log('[SEED]       They will be materialized per-organization by roleService.seedDefaultRolesForOrganization()');
    console.log('');
    console.log('[SEED] Migration completed successfully.');

    process.exit(0);
  } catch (err) {
    console.error('[SEED] FATAL ERROR:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
