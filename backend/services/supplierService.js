const Supplier = require('../models/Supplier');
const auditService = require('./auditService');

/**
 * Service to handle supplier operations and financial logic.
 */
class SupplierService {
  /**
   * Update a supplier's payable amount securely using atomic $inc.
   * 
   * @param {string} supplierId - The ID of the supplier.
   * @param {string} tenantId - The tenant ID.
   * @param {number} amount - The amount to adjust (must be greater than 0).
   * @param {string} type - 'INCREASE' (purchase made) or 'DECREASE' (payment made).
   * @param {string} userId - ID of the user performing action.
   * @param {object} session - Optional Mongoose transaction session.
   * @returns {object} The updated supplier document.
   */
  async updatePayable(supplierId, tenantId, amount, type, userId, session = null) {
    if (amount <= 0) {
      throw new Error('Amount must be greater than 0');
    }

    if (type !== 'INCREASE' && type !== 'DECREASE') {
      throw new Error(`Invalid payable update type: ${type}`);
    }

    const adjustment = type === 'INCREASE' ? amount : -amount;
    const purchasesAdjustment = type === 'INCREASE' ? amount : 0;

    // Get previous state for audit log and existence check
    const supplier = await Supplier.findOne({ _id: supplierId, tenantId }).session(session);

    if (!supplier) {
      throw new Error(`Supplier not found: ${supplierId}`);
    }

    const previousPayable = supplier.currentPayable || 0;

    // Atomic update to avoid race conditions
    const updatedSupplier = await Supplier.findOneAndUpdate(
      { _id: supplierId, tenantId },
      { 
        $inc: { 
          currentPayable: adjustment,
          totalPurchases: purchasesAdjustment
        } 
      },
      { new: true, session }
    );

    // Log the audit trail
    await auditService.logAction({
      userId: userId || 'SYSTEM',
      tenantId: tenantId,
      action: 'SUPPLIER_PAYABLE_UPDATE',
      resource: 'SUPPLIER',
      resourceId: supplierId,
      metadata: {
        previousPayable,
        newPayable: updatedSupplier.currentPayable,
        amount,
        type
      }
    }, session);

    return updatedSupplier;
  }
}

module.exports = new SupplierService();
