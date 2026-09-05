const baseFields = require('./baseFields');
const publicId = require('./publicId');
const tenantIsolation = require('./tenantIsolation');
const softDelete = require('./softDelete');
const auditTrail = require('./auditTrail');
const pagination = require('./pagination');
const timestamps = require('./timestamps');

/**
 * Applies all enterprise-grade plugins in the correct order.
 * 
 * @param {mongoose.Schema} schema 
 * @param {Object} options 
 * @param {boolean} options.tenant - If true, applies tenant isolation.
 * @param {string} options.publicPrefix - Prefix for publicId generation.
 */
module.exports = function applyEnterprisePlugins(schema, options = {}) {
  const { tenant = true, publicPrefix } = options;

  schema.plugin(baseFields);
  
  if (publicPrefix) {
    schema.plugin(publicId, { prefix: publicPrefix });
  }

  if (tenant) {
    schema.plugin(tenantIsolation);
  }

  schema.plugin(softDelete);
  schema.plugin(auditTrail);
  schema.plugin(pagination);
  schema.plugin(timestamps);
};
