const { ConflictError, ValidationError } = require('../utils/errors');
const { VALID_MODULES } = require('../config/featureRegistry');

class PackageService {
  constructor(packageRepository, auditLogService) {
    this.packageRepository = packageRepository;
    this.auditLogService = auditLogService;
  }

  async validatePackageData(data, existingId = null) {
    if (data.code) {
      const query = { code: data.code.toUpperCase() };
      if (existingId) query._id = { $ne: existingId };
      const existing = await this.packageRepository.findMany(query);
      if (existing && existing.length > 0) {
        throw new ConflictError(`Package with code ${data.code} already exists`);
      }
    }
    
    if (data.enabledModules && Array.isArray(data.enabledModules)) {
      for (const mod of data.enabledModules) {
        if (!VALID_MODULES.includes(mod)) {
          throw new ValidationError(`Invalid module feature code: ${mod}`);
        }
      }
    }
  }

  async createPackage(data, userId) {
    await this.validatePackageData(data);
    data.createdBy = userId;
    const pkg = await this.packageRepository.create(data);
    
    await this.auditLogService.log({
      userId,
      action: 'PACKAGE_CREATED',
      entityType: 'Package',
      entityId: pkg._id,
      details: `Package ${pkg.name} created`
    });

    return pkg;
  }

  async getPackage(id) {
    return await this.packageRepository.findById(id);
  }

  async listPackages(query, options) {
    const packages = await this.packageRepository.findMany(query, options);
    const total = await this.packageRepository.count(query);
    return { packages, total };
  }

  async updatePackage(id, data, userId) {
    await this.validatePackageData(data, id);
    data.updatedBy = userId;
    const pkg = await this.packageRepository.updateById(id, data);
    
    await this.auditLogService.log({
      userId,
      action: 'PACKAGE_UPDATED',
      entityType: 'Package',
      entityId: id,
      details: `Package details updated`
    });

    return pkg;
  }

  async deletePackage(id, userId) {
    const pkg = await this.packageRepository.updateById(id, { isDeleted: true });
    
    await this.auditLogService.log({
      userId,
      action: 'PACKAGE_DELETED',
      entityType: 'Package',
      entityId: id,
      details: `Package soft deleted (archived)`
    });

    return pkg;
  }
}

module.exports = PackageService;
