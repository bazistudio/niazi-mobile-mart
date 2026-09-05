const Product = require('../../models/Product');
const StockMovement = require('../../models/StockMovement');

/**
 * Repository for Inventory/Product database operations
 */
class InventoryHandler {
  /**
   * Atomically reduces or increases stock using $inc
   * @param {Object} params
   * @param {string} params.productId
   * @param {number} params.quantity - Positive to add, negative to reduce
   * @param {string} params.tenantId
   * @param {Object} [session] - Optional Mongoose session for transaction
   * @returns {Promise<Object>} Updated product
   */
  async atomicStockUpdate({ productId, quantity, tenantId }, session = null) {
    const query = { _id: productId, organizationId: tenantId };
    
    // Legacy support: fetch the product
    const product = await Product.findOne(query).session(session);
    if (!product) throw new Error("Product not found");

    // Aggregate real stock from StockMovement
    const stockAggr = await StockMovement.aggregate([
      { $match: { productId: product._id, organizationId: tenantId } },
      {
        $group: {
          _id: "$productId",
          totalStock: {
            $sum: { $cond: [{ $eq: ["$movementType", "IN"] }, "$quantity", { $multiply: ["$quantity", -1] }] }
          }
        }
      }
    ]).session(session);
    
    const currentStock = stockAggr.length > 0 ? stockAggr[0].totalStock : 0;

    // Validate stock if reducing
    if (quantity < 0) {
      if (currentStock + quantity < 0) {
        throw new Error(`Insufficient stock for Product ID: ${productId}`);
      }
    }

    // Return the product directly without mutating legacy fields. 
    // The actual StockMovement will be recorded by the caller via recordMovement.
    return { product, currentStock };
  }

  /**
   * Records a stock movement in the ledger
   * @param {Object} data - Stock movement data
   * @param {Object} [session] - Optional Mongoose session
   */
  async recordMovement(data, session = null) {
    const movement = new StockMovement(data);
    const options = session ? { session } : {};
    await movement.save(options);
    return movement;
  }

  /**
   * Finds a product by ID for reading data
   */
  async getProductById(productId, tenantId, session = null) {
    const query = Product.findOne({ _id: productId, tenantId });
    if (session) query.session(session);
    return await query;
  }
}

module.exports = new InventoryHandler();
