require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Branch = require('../models/Branch');
const Organization = require('../models/Organization');
const OrganizationMember = require('../models/OrganizationMember');
const { connectDB } = require('../db');
const { PRESET_ROLES } = require('../config/permissions');

async function migrate() {
  try {
    await connectDB();
    console.log('Connected to DB for migration');

    // 1. Find all shops that do not have an organizationId yet
    const shopsToMigrate = await Branch.find({ organizationId: { $exists: false } });
    console.log(`Found ${shopsToMigrate.length} shops to migrate`);

    const { customAlphabet } = require('nanoid');
    const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 8);

    const BATCH_SIZE = 100;
    for (let i = 0; i < shopsToMigrate.length; i += BATCH_SIZE) {
      const batch = shopsToMigrate.slice(i, i + BATCH_SIZE);
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        console.log(`Processing batch ${i / BATCH_SIZE + 1} (${batch.length} shops)...`);
        
        for (const shop of batch) {
          // Find the shop owner
          const owner = await User.findById(shop.ownerId).session(session);
          if (!owner) {
            console.warn(`Branch ${shop._id} has no valid owner, skipping...`);
            continue;
          }

          const code = `ORG-${nanoid()}`;

          const org = new Organization({
            name: shop.name,
            code: code,
            ownerId: owner._id,
            businessType: 'RETAIL',
            industryType: 'GENERAL_STORE',
          });

          await org.save({ session });
          
          shop.organizationId = org._id;
          shop.tenantId = undefined;
          await shop.save({ session });

          const membership = new OrganizationMember({
            organizationId: org._id,
            userId: owner._id,
            role: PRESET_ROLES.OWNER,
            isSystemOwner: true,
            status: 'ACTIVE'
          });
          await membership.save({ session });
        }

        await session.commitTransaction();
        session.endSession();
        console.log(`Batch ${i / BATCH_SIZE + 1} completed.`);
      } catch (err) {
        await session.abortTransaction();
        session.endSession();
        console.error(`Failed to migrate batch ${i / BATCH_SIZE + 1}:`, err);
      }
    }

    console.log('Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
