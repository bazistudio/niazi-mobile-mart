const Product = require('../../models/Product');

/**
 * Repository for Product database operations
 */
class ProductHandler {
  /**
   * Find products by an array of IDs for a specific tenant and shop
   * @param {string[]} productIds 
   * @param {string} tenantId 
   * @param {string} shopId 
   * @param {Object} [session]
   * @returns {Promise<Array>}
   */
  async findProductsByIds(productIds, tenantId, shopId, session = null) {
    const query = Product.find({ _id: { $in: productIds }, organizationId: tenantId });
    if (session) query.session(session);
    return await query;
  }

  /**
   * Find a single product
   * @param {string} productId 
   * @param {string} tenantId 
   * @param {Object} [session]
   * @returns {Promise<Object>}
   */
  async getProductById(productId, tenantId, session = null) {
    const query = Product.findOne({ _id: productId, organizationId: tenantId });
    if (session) query.session(session);
    return await query;
  }
}

module.exports = new ProductHandler();
