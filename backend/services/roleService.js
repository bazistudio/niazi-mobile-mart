const { DEFAULT_ROLE_TEMPLATES, PERMISSION_REGISTRY } = require('../config/permissions');
const { AppError, ValidationError, ForbiddenError } = require('../utils/errors');

class RoleService {
  constructor(roleRepository, rolePermissionRepository, permissionRepository) {
    this.roleRepository = roleRepository;
    this.rolePermissionRepository = rolePermissionRepository;
    this.permissionRepository = permissionRepository;
  }

  async createRole(data, options = {}) {
    const { name, description, organizationId, permissions = [] } = data;
    if (!name) throw new ValidationError('Role name is required');
    if (!organizationId) throw new ValidationError('organizationId is required');

    // Security Fix: Prevent external privilege escalation
    const isSystem = options.isSystemInternal ? data.isSystem : false;

    return await this.roleRepository.transaction(async (session) => {
      const txOptions = { ...options, session };

      const existing = await this.roleRepository.findByNameAndOrganization(name, organizationId, { ...txOptions, skipTenantGuard: true });
      if (existing) throw new AppError('Role with this name already exists in this organization', 400);

      const role = await this.roleRepository.create({ name, description, organizationId, isSystem, permissions: [] }, { ...txOptions, skipTenantGuard: true });

      if (permissions.length > 0) {
        await this.assignPermissionsToRole(role._id, permissions, organizationId, txOptions);
      }

      return role;
    });
  }

  async assignPermissionsToRole(roleId, permissionKeys, organizationId, options = {}) {
    const execute = async (session) => {
      const txOptions = { ...options, session: session || options.session };

      const role = await this.roleRepository.findById(roleId, { ...txOptions, skipTenantGuard: true });
      if (!role) throw new AppError('Role not found', 404);
      if (role.organizationId !== organizationId) throw new ForbiddenError('Role does not belong to this organization');

      const validKeys = new Set(PERMISSION_REGISTRY.map(p => p.key));
      const invalidKeys = permissionKeys.filter(key => !validKeys.has(key));
      if (invalidKeys.length > 0) throw new ValidationError('Invalid permission keys: ' + invalidKeys.join(', '));

      const permissions = await this.permissionRepository.findMany({ key: { $in: permissionKeys } }, { ...txOptions, skipTenantGuard: true });
      const permissionMap = new Map(permissions.map(p => [p.key, p._id]));

      await this.rolePermissionRepository.deleteByRoleId(roleId, { ...txOptions, skipTenantGuard: true });

      const mappings = [];
      for (const key of permissionKeys) {
        const permId = permissionMap.get(key);
        if (permId) mappings.push({ roleId, permissionId: permId });
      }

      if (mappings.length > 0) {
        await this.rolePermissionRepository.createMany(mappings, { ...txOptions, skipTenantGuard: true });
      }

      await this.syncRolePermissionCache(roleId, txOptions);

      return { roleId, assignedPermissions: permissionKeys };
    };

    if (options.session) {
      return await execute(options.session);
    } else {
      return await this.roleRepository.transaction(execute);
    }
  }

  async syncRolePermissionCache(roleId, options = {}) {
    const mappings = await this.rolePermissionRepository.findByRoleId(roleId, { ...options, skipTenantGuard: true });
    const permissionIds = mappings.map(m => m.permissionId);

    const permissions = await this.permissionRepository.findMany({ _id: { $in: permissionIds } }, { ...options, skipTenantGuard: true });
    const permissionKeys = permissions.map(p => p.key);

    await this.roleRepository.updateById(roleId, { permissions: permissionKeys }, { ...options, skipTenantGuard: true });

    return permissionKeys;
  }

  async duplicateRole(roleId, newName, organizationId, options = {}) {
    return await this.roleRepository.transaction(async (session) => {
      const txOptions = { ...options, session };
      const sourceRole = await this.roleRepository.findById(roleId, { ...txOptions, skipTenantGuard: true });
      if (!sourceRole) throw new AppError('Role not found', 404);

      let finalName = newName;
      let existing = await this.roleRepository.findByNameAndOrganization(finalName, organizationId, { ...txOptions, skipTenantGuard: true });
      
      let counter = 2;
      while (existing) {
        finalName = `${newName} (${counter})`;
        existing = await this.roleRepository.findByNameAndOrganization(finalName, organizationId, { ...txOptions, skipTenantGuard: true });
        counter++;
        if (counter > 20) throw new AppError('Too many role copies. Please specify a different name.', 400);
      }

      const newRole = await this.roleRepository.create({
        name: finalName,
        description: sourceRole.description ? sourceRole.description + ' (Copy)' : '(Copy)',
        organizationId,
        isSystem: false,
        permissions: []
      }, { ...txOptions, skipTenantGuard: true });

      const sourceMappings = await this.rolePermissionRepository.findByRoleId(roleId, { ...txOptions, skipTenantGuard: true });
      if (sourceMappings.length > 0) {
        const newMappings = sourceMappings.map(m => ({ roleId: newRole._id, permissionId: m.permissionId }));
        await this.rolePermissionRepository.createMany(newMappings, { ...txOptions, skipTenantGuard: true });
      }

      await this.syncRolePermissionCache(newRole._id, txOptions);

      return newRole;
    });
  }

  async deleteRole(roleId, organizationId, options = {}) {
    return await this.roleRepository.transaction(async (session) => {
      const txOptions = { ...options, session };
      const role = await this.roleRepository.findById(roleId, { ...txOptions, skipTenantGuard: true });
      if (!role) throw new AppError('Role not found', 404);

      if (role.isSystem) throw new ForbiddenError('System roles cannot be deleted');

      await this.rolePermissionRepository.deleteByRoleId(roleId, { ...txOptions, skipTenantGuard: true });
      await this.roleRepository.updateById(roleId, { isDeleted: true, deletedAt: new Date(), status: 'DELETED' }, { ...txOptions, skipTenantGuard: true });

      return { roleId, deleted: true };
    });
  }

  async getRoleById(roleId, options = {}) {
    return await this.roleRepository.findById(roleId, { ...options, skipTenantGuard: true });
  }

  async getRolesByOrganization(organizationId, options = {}) {
    return await this.roleRepository.findMany({ organizationId, isDeleted: { $ne: true } }, { ...options, skipTenantGuard: true, sort: { name: 1 } });
  }

  async getRolePermissions(roleId, options = {}) {
    const mappings = await this.rolePermissionRepository.findByRoleId(roleId, { ...options, skipTenantGuard: true });
    const permissionIds = mappings.map(m => m.permissionId);
    const permissions = await this.permissionRepository.findMany({ _id: { $in: permissionIds } }, { ...options, skipTenantGuard: true });
    return permissions.map(p => p.key);
  }

  async seedDefaultRolesForOrganization(organizationId, options = {}) {
    let created = 0, skipped = 0;
    const errors = [];

    await this.roleRepository.transaction(async (session) => {
      const txOptions = { ...options, session };
      for (const template of DEFAULT_ROLE_TEMPLATES) {
        try {
          const existing = await this.roleRepository.findByNameAndOrganization(template.name, organizationId, { ...txOptions, skipTenantGuard: true });
          if (existing) { skipped++; continue; }

          const role = await this.roleRepository.create({
            name: template.name,
            description: template.description,
            organizationId,
            isSystem: template.isSystem,
            permissions: []
          }, { ...txOptions, skipTenantGuard: true });

          if (template.permissions && template.permissions.length > 0) {
            const permissions = await this.permissionRepository.findMany({ key: { $in: template.permissions } }, { ...txOptions, skipTenantGuard: true });
            const mappings = permissions.map(p => ({ roleId: role._id, permissionId: p._id }));
            if (mappings.length > 0) {
              await this.rolePermissionRepository.createMany(mappings, { ...txOptions, skipTenantGuard: true });
            }
            await this.syncRolePermissionCache(role._id, txOptions);
          }
          created++;
        } catch (err) {
          errors.push({ role: template.name, error: err.message });
        }
      }
    });

    return { total: DEFAULT_ROLE_TEMPLATES.length, created, skipped, errors };
  }
}

module.exports = RoleService;
