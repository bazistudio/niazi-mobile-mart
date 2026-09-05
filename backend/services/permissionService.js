const { PERMISSION_REGISTRY, MODULES, ACTIONS, MODULE_ACTIONS } = require('../config/permissions');
const { AppError, ValidationError } = require('../utils/errors');

class PermissionService {
  constructor(permissionRepository) {
    this.permissionRepository = permissionRepository;
  }

  async getAllPermissions(options = {}) {
    return await this.permissionRepository.findMany({}, { sort: { module: 1, action: 1 }, ...options });
  }

  async getPermissionsGroupedByModule(options = {}) {
    const permissions = await this.getAllPermissions(options);
    const grouped = {};
    for (const perm of permissions) {
      if (!grouped[perm.module]) grouped[perm.module] = [];
      grouped[perm.module].push(perm);
    }
    return grouped;
  }

  async getModules() { return MODULES; }
  async getActions() { return ACTIONS; }

  validatePermissionKeys(permissionKeys) {
    if (!Array.isArray(permissionKeys)) throw new ValidationError('Permission keys must be an array');
    const validKeys = new Set(PERMISSION_REGISTRY.map(p => p.key));
    const invalidKeys = permissionKeys.filter(key => !validKeys.has(key));
    if (invalidKeys.length > 0) throw new ValidationError('Invalid permission keys: ' + invalidKeys.join(', '));
  }

  async seedPermissions() {
    let created = 0, skipped = 0;
    const errors = [];
    for (const perm of PERMISSION_REGISTRY) {
      try {
        const existing = await this.permissionRepository.findOne({ key: perm.key }, { skipTenantGuard: true });
        if (existing) { skipped++; continue; }
        await this.permissionRepository.create({ key: perm.key, module: perm.module, action: perm.action, description: perm.description }, { skipTenantGuard: true });
        created++;
      } catch (err) {
        if (err.code === 11000) { skipped++; } else { errors.push({ key: perm.key, error: err.message }); }
      }
    }
    return { total: PERMISSION_REGISTRY.length, created, skipped, errors };
  }

  async getPermissionByKey(key, options = {}) {
    return await this.permissionRepository.findOne({ key }, options);
  }

  async getPermissionsByModule(module, options = {}) {
    return await this.permissionRepository.findMany({ module }, options);
  }
}

module.exports = PermissionService;
