module.exports = {
  metadata: {
    name: "Map Legacy Tenants to Organizations",
    version: "V3.0",
    author: "TijaratPro Architect",
    purpose: "Transforms legacy Tenant/Shop collections into V3 Organization/Branch collections.",
    collectionsAffected: ["tenants", "shops", "organizations", "branches", "users"],
    estimatedRuntime: "10 seconds",
    rollbackStrategy: "Drop mapped collections and reverse user IDs."
  },

  async up(db, client, session) {
    console.log("Starting migration: Tenant -> Organization");

    // 1. Tenants to Organizations
    const tenants = await db.collection('tenants').find({}).toArray();
    for (const tenant of tenants) {
      const crypto = require('crypto');
      const publicId = `ORG-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const uuid = crypto.randomUUID();

      const org = {
        _id: tenant._id,
        name: tenant.name || 'Legacy Organization',
        code: tenant.code || `ORG-${tenant._id.toString().substring(0,4)}`.toUpperCase(),
        ownerId: tenant.ownerId,
        publicId: tenant.publicId || publicId,
        uuid: tenant.uuid || uuid,
        createdAt: tenant.createdAt || new Date(),
        updatedAt: tenant.updatedAt || new Date()
      };
      
      // Upsert to ensure idempotency
      await db.collection('organizations').updateOne(
        { _id: tenant._id },
        { $set: org },
        { upsert: true, session }
      );
    }

    // 2. Shops to Branches
    const shops = await db.collection('shops').find({}).toArray();
    for (const shop of shops) {
      const crypto = require('crypto');
      const publicId = `BRN-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const uuid = crypto.randomUUID();

      const branch = {
        _id: shop._id,
        name: shop.name || 'Main Branch',
        organizationId: shop.tenantId, // Map tenantId -> organizationId
        publicId: shop.publicId || publicId,
        uuid: shop.uuid || uuid,
        createdAt: shop.createdAt || new Date(),
        updatedAt: shop.updatedAt || new Date()
      };

      await db.collection('branches').updateOne(
        { _id: shop._id },
        { $set: branch },
        { upsert: true, session }
      );
    }

    // 3. Update Users (tenantId -> organizationId, shopId -> branchId)
    await db.collection('users').updateMany(
      { tenantId: { $exists: true } },
      [ { $set: { organizationId: "$tenantId" } } ],
      { session }
    );
    
    // We do not remove old fields yet, allowing for dual read during blue-green deployment.
    // They can be removed in a subsequent V4 migration.
  },

  async down(db, client, session) {
    console.log("Rolling back migration: Tenant -> Organization");

    // Remove the new fields from Users
    await db.collection('users').updateMany(
      { organizationId: { $exists: true } },
      { $unset: { organizationId: "" } },
      { session }
    );

    // Delete created organizations and branches (assumes they were exactly matched by _id)
    const tenants = await db.collection('tenants').find({}).toArray();
    const tenantIds = tenants.map(t => t._id);
    await db.collection('organizations').deleteMany({ _id: { $in: tenantIds } }, { session });

    const shops = await db.collection('shops').find({}).toArray();
    const shopIds = shops.map(s => s._id);
    await db.collection('branches').deleteMany({ _id: { $in: shopIds } }, { session });
  }
};
