const Customer = require('../models/Customer');
const auditService = require('./auditService');

/**
 * Service to handle customer operations and financial logic.
 */
class CustomerService {
  /**
   * Update a customer's balance securely using atomic $inc.
   * 
   * @param {string} customerId - The ID of the customer.
   * @param {string} tenantId - The tenant ID.
   * @param {number} amount - The amount to adjust (must be greater than 0).
   * @param {string} type - 'INCREASE' (credit sale) or 'DECREASE' (payment/refund).
   * @param {string} userId - ID of the user performing action.
   * @param {object} session - Optional Mongoose transaction session.
   * @returns {object} The updated customer document.
   */
  async updateBalance(customerId, tenantId, amount, type, userId, session = null) {
    if (amount <= 0) {
      throw new Error('Amount must be greater than 0');
    }

    if (type !== 'INCREASE' && type !== 'DECREASE') {
      throw new Error(`Invalid balance update type: ${type}`);
    }

    const adjustment = type === 'INCREASE' ? amount : -amount;

    // Get previous state for audit log and existence check
    const customer = await Customer.findOne({ _id: customerId, tenantId }).session(session);

    if (!customer) {
      throw new Error(`Customer not found: ${customerId}`);
    }

    const previousBalance = customer.currentBalance || 0;

    // Atomic update to avoid race conditions
    const updatedCustomer = await Customer.findOneAndUpdate(
      { _id: customerId, tenantId },
      { $inc: { currentBalance: adjustment } },
      { new: true, session }
    );

    // Optional: We can still warn or check if credit limit exceeded after the update
    if (updatedCustomer.currentBalance > updatedCustomer.creditLimit) {
      console.warn(`Customer ${customerId} has exceeded their credit limit.`);
    }

    // Log the audit trail
    await auditService.logAction({
      userId: userId || 'SYSTEM',
      tenantId: tenantId,
      action: 'CUSTOMER_BALANCE_UPDATE',
      resource: 'CUSTOMER',
      resourceId: customerId,
      metadata: {
        previousBalance,
        newBalance: updatedCustomer.currentBalance,
        amount,
        type
      }
    }, session);

    return updatedCustomer;
  }
}

module.exports = new CustomerService();
