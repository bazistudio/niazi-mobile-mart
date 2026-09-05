const Payment = require('../../models/Payment');

/**
 * Repository for Payment operations enforcing double-spend locks
 */
class PaymentHandler {
  
  /**
   * Initialize a new payment intent
   */
  async createIntent(data, session = null) {
    const payment = new Payment({ ...data, status: 'pending' });
    const options = session ? { session } : {};
    await payment.save(options);
    return payment;
  }

  /**
   * Safely confirm a payment exactly once using an atomic lock.
   * Prevents double-spend race conditions.
   * @param {string} paymentIntentId 
   * @param {string} tenantId 
   * @param {Object} [session] 
   * @returns {Promise<Object>} Confirmed payment, or null if already confirmed/failed
   */
  async confirmPaymentAtomic(paymentIntentId, tenantId, session = null) {
    const options = { new: true };
    if (session) options.session = session;

    // ATOMIC LOCK: Only update if the status is exactly 'pending'
    return await Payment.findOneAndUpdate(
      { payment_intent_id: paymentIntentId, tenantId, status: 'pending' },
      { $set: { status: 'confirmed' } },
      options
    );
  }

  /**
   * Mark a payment as failed
   */
  async failPayment(paymentIntentId, tenantId, session = null) {
    const options = { new: true };
    if (session) options.session = session;

    return await Payment.findOneAndUpdate(
      { payment_intent_id: paymentIntentId, tenantId, status: 'pending' },
      { $set: { status: 'failed' } },
      options
    );
  }
}

module.exports = new PaymentHandler();
