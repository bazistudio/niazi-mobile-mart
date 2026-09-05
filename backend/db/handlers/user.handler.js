const User = require('../../models/User');

/**
 * Repository for User database operations
 */
class UserHandler {
  /**
   * Find a user by ID ensuring they belong to the correct tenant
   * @param {string} userId 
   * @param {string} tenantId 
   * @returns {Promise<Object>}
   */
  async findById(userId, tenantId) {
    return await User.findOne({ _id: userId, tenantId, status: { $ne: 'deleted' } });
  }

  /**
   * Soft deletes a user
   * @param {string} userId 
   * @param {string} tenantId 
   * @returns {Promise<Object>}
   */
  async softDeleteUser(userId, tenantId) {
    return await User.findOneAndUpdate(
      { _id: userId, tenantId },
      { status: 'deleted' },
      { new: true }
    );
  }

  /**
   * Create a new user
   * @param {Object} userData 
   * @param {Object} [session] 
   * @returns {Promise<Object>}
   */
  async createUser(userData, session = null) {
    const user = new User(userData);
    const options = session ? { session } : {};
    await user.save(options);
    return user;
  }
}

module.exports = new UserHandler();
