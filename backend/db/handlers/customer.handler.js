const Customer = require('../../models/Customer');

/**
 * Repository for Customer database operations
 */
class CustomerHandler {
  /**
   * Finds a customer by ID
   * @param {string} customerId 
   * @param {string} tenantId 
   * @param {Object} [session]
   * @returns {Promise<Object>}
   */
  async getCustomerById(customerId, tenantId, session = null) {
    const query = Customer.findOne({ _id: customerId, tenantId });
    if (session) query.session(session);
    return await query;
  }
}

module.exports = new CustomerHandler();
