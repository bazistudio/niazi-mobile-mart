const BaseRepository = require('../BaseRepository');
const RolePermission = require('../../models/RolePermission');

/**
 * Repository for the RolePermission mapping collection.
 * This is the PRIMARY source of truth for role-permission relationships.
 *
 * Architecture:
 * - RolePermission collection = primary role-permission relationship
 * - Role.permissions[] = synchronized cache (kept in sync by roleService)
 */
class RolePermissionRepository extends BaseRepository {
  constructor() {
    super(RolePermission);
  }

  /**
   * Find all permission mappings for a given role.
   * @param {string} roleId - UUID of the role
   * @param {Object} options - Query options (session, etc.)
   * @returns {Promise<Array>} Array of RolePermission documents
   */
  async findByRoleId(roleId, options = {}) {
    return await this.findMany({ roleId }, options);
  }

  /**
   * Find all role mappings for a given permission.
   * @param {string} permissionId - UUID of the permission
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of RolePermission documents
   */
  async findByPermissionId(permissionId, options = {}) {
    return await this.findMany({ permissionId }, options);
  }

  /**
   * Find a specific role-permission mapping.
   * @param {string} roleId - UUID of the role
   * @param {string} permissionId - UUID of the permission
   * @param {Object} options - Query options
   * @returns {Promise<Object|null>} RolePermission document or null
   */
  async findByRoleAndPermission(roleId, permissionId, options = {}) {
    return await this.findOne({ roleId, permissionId }, options);
  }

  /**
   * Delete all permission mappings for a given role.
   * Used when reassigning permissions or deleting a role.
   * @param {string} roleId - UUID of the role
   * @param {Object} options - Query options (session, etc.)
   * @returns {Promise<Object>} Delete result
   */
  async deleteByRoleId(roleId, options = {}) {
    const query = this.model.deleteMany({ roleId });
    if (options.session) query.session(options.session);
    return await query.exec();
  }

  /**
   * Delete a specific role-permission mapping.
   * @param {string} roleId - UUID of the role
   * @param {string} permissionId - UUID of the permission
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Delete result
   */
  async deleteByRoleAndPermission(roleId, permissionId, options = {}) {
    const query = this.model.deleteOne({ roleId, permissionId });
    if (options.session) query.session(options.session);
    return await query.exec();
  }

  /**
   * Count how many roles use a given permission.
   * Useful for checking if a permission is in use before deletion.
   * @param {string} permissionId - UUID of the permission
   * @returns {Promise<number>} Count of roles using this permission
   */
  async countRolesByPermission(permissionId) {
    return await this.count({ permissionId });
  }
}

module.exports = RolePermissionRepository;