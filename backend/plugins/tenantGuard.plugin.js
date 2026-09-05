const logger = require('../utils/logger');

/**
 * Global Mongoose Plugin for Tenant Data Isolation
 * Prevents accidental cross-tenant data leaks by enforcing tenantId on every query.
 */
function tenantGuardPlugin(schema) {
  // Exclude schemas that are inherently tenant-agnostic (like the Tenant model itself, Users sometimes, etc.)
  // For TijaratPro, assuming almost everything requires tenantId except specific system models
  
    const enforceTenantGuard = function () {
    const options = this.getOptions() || {};
    const model = this.model || this._model;
    const modelName = model ? model.modelName : 'UnknownModel';
    const query = this.getQuery() || {};


    
    // Explicit bypass hatch for system scripts or admin queries
    if (options.skipTenantGuard || options.context?.role === 'SUPER_ADMIN') {

      return;
    }

    // Global bypass for platform operations (migrations, system cron logic)
    const { getTenantStore } = require('../middleware/context/asyncContext');
    const store = getTenantStore();
    if (store && store.isSystemContext) {

      return;
    }

    if (['Tenant', 'Organization', 'Branch', 'Counter', 'ProcessedRequest', 'UserSession', 'User', 'OrganizationRequest'].includes(modelName)) {

      return;
    }

    // Determine what field this model uses for tenancy
    const hasOrgId = model && model.schema && model.schema.paths.organizationId;
    const hasLegacyTenantId = model && model.schema && model.schema.paths.tenantId;

    if (hasOrgId && !query.organizationId) {
      const errorMsg = `CRITICAL TENANT LEAK PREVENTED: Attempted to query ${modelName} without an organizationId constraint.`;
      logger.error(errorMsg, { query, modelName });
      throw new Error(errorMsg);
    }

    if (!hasOrgId && hasLegacyTenantId && !query.tenantId) {
      const errorMsg = `CRITICAL TENANT LEAK PREVENTED: Attempted to query ${modelName} without a tenantId constraint.`;
      logger.error(errorMsg, { query, modelName });
      throw new Error(errorMsg);
    }


  };

  const enforceAggregateTenantGuard = function () {
    const options = this.options || {};
    const model = this._model;
    const modelName = model ? model.modelName : 'UnknownModel';



    if (options.skipTenantGuard || options.context?.role === 'SUPER_ADMIN') {

      return;
    }

    // Global bypass for platform operations (migrations, system cron logic)
    const { getTenantStore } = require('../middleware/context/asyncContext');
    const store = getTenantStore();
    if (store && store.isSystemContext) {

      return;
    }

    if (['Tenant', 'Organization', 'Branch', 'Counter', 'ProcessedRequest', 'UserSession', 'User', 'OrganizationRequest'].includes(modelName)) {

      return;
    }

    const pipeline = this.pipeline();

    // Determine what field this model uses for tenancy
    const hasOrgId = model && model.schema && model.schema.paths.organizationId;
    const hasLegacyTenantId = model && model.schema && model.schema.paths.tenantId;

    let hasOrgIdMatch = false;
    let hasTenantIdMatch = false;

    // Check all initial $match stages (added by user or other plugins like softDelete)
    for (const stage of pipeline) {
      if (stage.$match) {
        if (stage.$match.organizationId) hasOrgIdMatch = true;
        if (stage.$match.tenantId) hasTenantIdMatch = true;
      } else {
        // Stop checking once we hit a non-$match stage (e.g. $lookup, $group)
        // If we haven't found the tenant guard by now, it's a potential leak
        break;
      }
    }

    if (hasOrgId && !hasOrgIdMatch) {
      const errorMsg = `CRITICAL TENANT LEAK PREVENTED: Attempted to aggregate ${modelName} without an organizationId constraint in the initial $match stages.`;
      logger.error(errorMsg, { pipeline, modelName });
      throw new Error(errorMsg);
    }

    if (!hasOrgId && hasLegacyTenantId && !hasTenantIdMatch) {
      const errorMsg = `CRITICAL TENANT LEAK PREVENTED: Attempted to aggregate ${modelName} without a tenantId constraint in the initial $match stages.`;
      logger.error(errorMsg, { pipeline, modelName });
      throw new Error(errorMsg);
    }


  };

  // Attach to all standard read/update operations
  schema.pre('find', enforceTenantGuard);
  schema.pre('findOne', enforceTenantGuard);
  schema.pre('findOneAndUpdate', enforceTenantGuard);
  schema.pre('countDocuments', enforceTenantGuard);
  schema.pre('updateMany', enforceTenantGuard);
  schema.pre('updateOne', enforceTenantGuard);
  schema.pre('deleteMany', enforceTenantGuard);
  schema.pre('deleteOne', enforceTenantGuard);
  schema.pre('aggregate', enforceAggregateTenantGuard);
}

module.exports = tenantGuardPlugin;
