/**
 * Centralized utility to ensure Mongoose populate queries are strictly tenant-isolated.
 * Note: The tenantIsolation plugin auto-injects organizationId on all find queries,
 * so no explicit match filter is needed here.
 * 
 * @param {string} path - The document path to populate (e.g. 'categoryId')
 * @param {string} select - Space-separated fields to select
 * @param {string} organizationId - Kept for backwards compatibility but not used in match
 * @returns {Object} Populate configuration object
 */
const tenantPopulate = (path, select, organizationId) => {
  return {
    path,
    select,
  };
};

module.exports = tenantPopulate;
