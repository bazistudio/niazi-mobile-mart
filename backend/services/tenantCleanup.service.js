const mongoose = require("mongoose");

/**
 * Perform a cascading hard delete of all documents related to a specific tenant.
 * Iterates through all registered Mongoose models and deletes documents where
 * tenantId, organizationId, or shopId match the given ID.
 * 
 * @param {string} tenantId 
 * @returns {Object} A map of ModelName -> deletedCount
 */
exports.hardDeleteTenantData = async (tenantId) => {
  if (!tenantId) {
    throw new Error("Tenant ID is required for hard delete");
  }

  // 1. Explicitly Handle External Side-Effects First
  // Cloud storage, cache invalidation, webhooks, or 3rd-party system cleanup.
  await cleanupExternalResources(tenantId);

  const deletedCounts = {};
  const models = mongoose.modelNames();

  for (const modelName of models) {
    const Model = mongoose.model(modelName);
    
    // Skip models that are strictly global and never tenant-scoped to be safe
    if (['SystemSettings', 'SuperAdmin', 'MigrationHistory'].includes(modelName)) {
      continue;
    }

    const schemaPaths = Object.keys(Model.schema.paths);
    const queryConditions = [];

    // Standard relational fields in this architecture
    if (schemaPaths.includes("tenantId")) queryConditions.push({ tenantId });
    if (schemaPaths.includes("organizationId")) queryConditions.push({ organizationId: tenantId });
    if (schemaPaths.includes("shopId")) queryConditions.push({ shopId: tenantId });

    if (queryConditions.length > 0) {
      // For models using plugins like softDelete or globalTenantGuard, we need to ensure
      // we bypass them to actually perform a HARD delete of EVERYTHING.
      
      // Some plugins override deleteMany. We will use the native MongoDB collection 
      // directly to guarantee a true hard delete, bypassing any mongoose middleware.
      const collection = Model.collection;
      
      // Mongoose native driver syntax
      const result = await collection.deleteMany({ $or: queryConditions });
      if (result.deletedCount > 0) {
        deletedCounts[modelName] = result.deletedCount;
      }
    }
  }

  // Special Cases: Delete the actual root entities whose _id IS the tenantId.
  // We use native driver here as well to bypass softDelete middleware completely.
  
  const rootModels = ['Tenant', 'Organization', 'Shop', 'Branch'];
  for (const rootModel of rootModels) {
    try {
      const Model = mongoose.model(rootModel);
      const collection = Model.collection;
      const orConditions = [{ _id: tenantId }];
      if (typeof tenantId === 'string' && tenantId.length === 24) {
        orConditions.push({ _id: new mongoose.Types.ObjectId(tenantId) });
      }
      const result = await collection.deleteMany({ $or: orConditions });
      if (result.deletedCount > 0) {
        deletedCounts[rootModel] = (deletedCounts[rootModel] || 0) + result.deletedCount;
      }
    } catch (e) {
      // Model might not exist depending on the schema version loaded, ignore safely
    }
  }

  return deletedCounts;
};

/**
 * Perform external resource cleanup (Cloud Storage, Caches, etc.)
 * This must be done BEFORE deleting the database records.
 */
async function cleanupExternalResources(tenantId) {
  console.log(`[CLEANUP] Starting external resource cleanup for tenant ${tenantId}`);
  
  try {
    const MediaLibrary = mongoose.model("MediaLibrary");
    
    // Find all media files belonging to this tenant
    const mediaFiles = await MediaLibrary.find({ 
      $or: [{ organizationId: tenantId }, { tenantId: tenantId }] 
    });

    for (const file of mediaFiles) {
      // In a real implementation, you would call your cloud storage service here:
      // if (file.storageProvider === 'S3') { await s3Service.deleteFile(file.storageKey); }
      // if (file.storageProvider === 'CLOUDINARY') { await cloudinaryService.deleteFile(file.storageKey); }
      console.log(`[CLEANUP] Would delete file from ${file.storageProvider}: ${file.storageKey}`);
    }
    
    console.log(`[CLEANUP] Processed ${mediaFiles.length} media files for deletion.`);
  } catch (error) {
    // Model might not be registered or query fails
    console.error("[CLEANUP] Error cleaning up external resources:", error.message);
  }
}

