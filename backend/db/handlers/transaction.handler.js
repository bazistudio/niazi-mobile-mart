const LedgerEntry = require('../../models/LedgerEntry');
const Customer = require('../../models/Customer');

/**
 * Repository for Ledger and Financial Transaction operations
 */
class TransactionHandler {
  /**
   * Creates an immutable ledger entry
   * @param {Object} data 
   * @param {Object} [session] 
   * @returns {Promise<Object>}
   */
  async createLedgerEntry(data, session = null) {
    const entry = new LedgerEntry(data);
    const options = session ? { session } : {};
    await entry.save(options);
    return entry;
  }

  /**
   * Updates customer balance atomically and creates a ledger entry
   * @param {Object} params
   * @param {string} params.customerId
   * @param {number} params.amount - Amount to add to debt (negative reduces debt)
   * @param {string} params.tenantId
   * @param {Object} params.ledgerData - Data for the ledger entry
   * @param {Object} [session]
   */
  async addCustomerCharge({ customerId, amount, tenantId, shopId, ledgerData }, session = null) {
    const options = { new: true };
    if (session) options.session = session;

    // Atomically increment the current balance using Customer model
    let customer = await Customer.findOneAndUpdate(
      { _id: customerId, organizationId: tenantId },
      { $inc: { currentBalance: amount } },
      options
    );

    if (!customer) {
      // It's possible the user selected a mock walk-in customer or Customer wasn't found
      // We will allow it to proceed to LedgerEntry to maintain financial integrity,
      // but customer balance won't be updated.
      console.warn(`Customer not found for ID: ${customerId}`);
    }

    // Create immutable ledger entry for V3
    const ledgerEntry = await this.createLedgerEntry({
      ...ledgerData,
      organizationId: tenantId,
      branchId: shopId
    }, session);

    return { customer, ledgerEntry };
  }
}

module.exports = new TransactionHandler();
