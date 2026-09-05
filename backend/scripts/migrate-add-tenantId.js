/**
 * Migration Script: migrate-add-tenantId.js
 * 
 * Purpose: Transition from Branch-Id based isolation to Tenant-Id based isolation.
 * Hierarchy: Tenant -> Branch -> User -> Data
 * 
 * Instructions:
 * 1. Ensure .env is loaded.
 * 2. Run with `node scripts/migrate-add-tenantId.js`
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Tenant = require('../models/Tenant');
const Branch = require('../models/Branch');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Customer = require('../models/Customer');

async function migrate() {
  try {
    console.log('--- Starting Tenancy Migration ---');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB.');

    // 1. Create System Tenant (for Super Admins)
    let systemTenant = await Tenant.findOne({ name: 'TijaratPro System' });
    if (!systemTenant) {
      systemTenant = await Tenant.create({
        name: 'TijaratPro System',
        businessType: 'SYSTEM',
        status: 'active',
        isActive: true,
      });
      console.log('Created System Tenant.');
    } else {
      console.log('System Tenant already exists.');
    }

    // 2. Iterate through all Shops
    const shops = await Branch.find();
    console.log(`Found ${shops.length} shops to migrate.`);

    for (const shop of shops) {
      // Find or create a Tenant for this Branch
      let tenant = await Tenant.findOne({ name: shop.name });
      if (!tenant) {
        tenant = await Tenant.create({
          name: shop.name,
          businessType: 'RETAIL', // Default as per decision
          status: shop.status === 'active' ? 'active' : 'inactive',
          isActive: !shop.isDeleted,
        });
        console.log(`Created Tenant for shop: ${shop.name}`);
      }

      const tenantId = tenant._id;

      // Update the Branch itself
      await Branch.updateOne({ _id: shop._id }, { tenantId });
      console.log(`Updated Branch [${shop.name}] with tenantId.`);

      // Propagate to linked data
      const resultProducts = await Product.updateMany({ shopId: shop.ownerId }, { tenantId });
      const resultOrders = await Order.updateMany({ shopId: shop.ownerId }, { tenantId });
      const resultCustomers = await Customer.updateMany({ shopId: shop.ownerId }, { tenantId });
      const resultUsers = await User.updateMany({ shopId: shop.ownerId }, { tenantId });
      
      // Also update the owner user specifically
      await User.updateOne({ _id: shop.ownerId }, { tenantId });

      console.log(`Propagated tenantId to: ${resultProducts.modifiedCount} Products, ${resultOrders.modifiedCount} Orders, ${resultCustomers.modifiedCount} Customers, ${resultUsers.modifiedCount} Users.`);
    }

    // 3. Assign System Tenant to all Super Admins who don't have a tenantId yet
    const resultAdmins = await User.updateMany(
      { role: 'superadmin', tenantId: { $exists: false } },
      { tenantId: systemTenant._id }
    );
    console.log(`Assigned System Tenant to ${resultAdmins.modifiedCount} Super Admins.`);

    // 4. Final verification
    const orphanedUsers = await User.countDocuments({ tenantId: { $exists: false } });
    const orphanedShops = await Branch.countDocuments({ tenantId: { $exists: false } });
    const orphanedProducts = await Product.countDocuments({ tenantId: { $exists: false } });

    console.log('\n--- Migration Verification ---');
    console.log(`Users without tenantId: ${orphanedUsers}`);
    console.log(`Shops without tenantId: ${orphanedShops}`);
    console.log(`Products without tenantId: ${orphanedProducts}`);

    if (orphanedUsers === 0 && orphanedShops === 0 && orphanedProducts === 0) {
      console.log('SUCCESS: All records have been successfully migrated.');
    } else {
      console.log('WARNING: Some records are still missing tenantId. Check your data mappings.');
    }

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('DB Connection closed.');
  }
}

migrate();
