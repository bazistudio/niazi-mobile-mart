const Order = require('../../models/Order');
require('../../models/Party');
const tenantPopulate = require('../../utils/tenantPopulate');

/**
 * Repository for Order database operations
 */
class OrderHandler {
  /**
   * Creates an order with immutable snapshot items
   * @param {Object} orderData
   * @param {Object} [session]
   * @returns {Promise<Object>}
   */
  async createOrder(orderData, session = null) {
    const order = new Order(orderData);
    const options = session ? { session } : {};
    await order.save(options);
    return order;
  }

  /**
   * Finds orders with pagination and filtering
   * @param {Object} params
   * @param {string} params.tenantId
   * @param {Object} [params.filters]
   * @param {number} [params.page=1]
   * @param {number} [params.limit=10]
   * @returns {Promise<Object>}
   */
  async getOrders({ tenantId, filters = {}, page = 1, limit = 10 }) {
    const query = { organizationId: tenantId, ...filters };
    
    const orders = await Order.find(query)
      // Since user hasn't fully migrated to Party, we override the ref to point to Customer collection
      .populate({ path: "partyId", model: "Customer", select: "name email phone", match: { organizationId: tenantId } })
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Order.countDocuments(query);

    return { orders, total };
  }

  /**
   * Gets an order by ID and ensures it belongs to the tenant
   * @param {string} orderId 
   * @param {string} tenantId 
   * @param {Object} [session]
   * @returns {Promise<Object>}
   */
  async getOrderById(orderId, tenantId, session = null) {
    const query = Order.findOne({ _id: orderId, organizationId: tenantId });
    if (session) query.session(session);
    return await query;
  }

  /**
   * Updates order status
   * @param {string} orderId 
   * @param {string} tenantId 
   * @param {string} status 
   * @param {Object} [session]
   * @returns {Promise<Object>}
   */
  async updateOrderStatus(orderId, tenantId, status, session = null) {
    const options = { new: true };
    if (session) options.session = session;

    return await Order.findOneAndUpdate(
      { _id: orderId, organizationId: tenantId },
      { status },
      options
    );
  }
}

module.exports = new OrderHandler();
