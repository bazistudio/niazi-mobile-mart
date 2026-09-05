const ProcessedRequest = require('../../models/ProcessedRequest');

/**
 * Repository for Idempotency tracking operations
 */
class IdempotencyHandler {
  /**
   * Check if an idempotency key already exists
   * @param {string} key 
   * @param {string} tenantId
   * @returns {Promise<Object>}
   */
  async getProcessedRequest(key, tenantId) {
    return await ProcessedRequest.findOne({ key, tenantId });
  }

  /**
   * Store a successfully processed request to prevent duplicate processing
   * @param {Object} data 
   * @param {string} data.key
   * @param {string} data.method
   * @param {string} data.url
   * @param {number} data.status
   * @param {Object} data.response
   * @param {string} [data.tenantId]
   * @param {string} [data.userId]
   * @returns {Promise<Object>}
   */
  async saveProcessedRequest(data) {
    // Keep idempotency records for 24 hours (Cloud Run retries happen within minutes)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const record = new ProcessedRequest({
      ...data,
      expiresAt
    });

    // Use save (can optionally wrap in try-catch for duplicate key error on immediate concurrent requests)
    try {
      await record.save();
      return record;
    } catch (error) {
      if (error.code === 11000) {
        // Race condition: another request just saved it
        return await ProcessedRequest.findOne({ key: data.key, tenantId: data.tenantId });
      }
      throw error;
    }
  }
}

module.exports = new IdempotencyHandler();
