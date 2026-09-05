const asyncContext = require('../middleware/context/asyncContext');

/**
 * Automatically injects the tenant context into Mongoose queries.
 * Ensures cross-tenant data isolation at the repository level.
 * 
 * @param {Object} query - The initial MongoDB query object
 * @returns {Object} - The query object enhanced with context
 */
exports.withContext = (query = {}) => {
  const store = asyncContext.getStore();
  
  if (!store || !store.organizationId) {
    throw new Error('Database queried without active organization context.');
  }

  // Ensure organization isolation
  const contextQuery = { ...query, organizationId: store.organizationId };

  // If a shop is active, restrict to that shop (or allow organization-wide queries if explicitly requested)
  if (store.shopId && !query._skipShopFilter) {
    contextQuery.shopId = store.shopId;
  }
  
  delete contextQuery._skipShopFilter;

  return contextQuery;
};
