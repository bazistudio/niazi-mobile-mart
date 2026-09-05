const mongoose = require('mongoose');
const { getTenantStore } = require('../../middleware/context/asyncContext');

module.exports = function tenantIsolationPlugin(schema) {
  if (!schema.paths.organizationId) {
    schema.add({ organizationId: { type: String, ref: 'Organization', index: true } });
  }
  if (!schema.paths.branchId) {
    schema.add({ branchId: { type: String, ref: 'Branch', index: true } });
  }

  const injectTenantContext = function () {
    const { organizationId } = getTenantStore();
    if (organizationId) {
      this.where({ organizationId });
    }
  };

  schema.pre('find', injectTenantContext);
  schema.pre('findOne', injectTenantContext);
  schema.pre('findOneAndUpdate', injectTenantContext);
  schema.pre('countDocuments', injectTenantContext);
  schema.pre('updateMany', injectTenantContext);

  // Aggregate middleware
  schema.pre('aggregate', function () {
    const { organizationId } = getTenantStore();
    if (organizationId) {
      const pipeline = this.pipeline();
      const firstStage = pipeline.length > 0 ? Object.keys(pipeline[0])[0] : null;
      
      const specialFirstStages = ['$geoNear', '$indexStats', '$search'];
      
      if (firstStage && specialFirstStages.includes(firstStage)) {
        pipeline.splice(1, 0, { $match: { organizationId } });
      } else {
        pipeline.unshift({ $match: { organizationId } });
      }
    }
  });
};
