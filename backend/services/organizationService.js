const { PRESET_ROLES } = require('../config/permissions');
const { NotFoundError, ConflictError } = require('../utils/errors');
const { customAlphabet } = require('nanoid');
const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 8);

class OrganizationService {
  constructor(organizationRepository, organizationMemberRepository, auditLogService, subscriptionService, roleService) {
    this.organizationRepository = organizationRepository;
    this.organizationMemberRepository = organizationMemberRepository;
    this.auditLogService = auditLogService;
    this.subscriptionService = subscriptionService;
    this.roleService = roleService;
  }

  async createOrganization(data, ownerId) {
    // Generate deterministic, clean IDs using NanoID with ORG- prefix
    const code = `ORG-${nanoid()}`;
    
    // We start a transaction for organization creation since it involves multiple repositories
    return await this.organizationRepository.transaction(async (session) => {
      const organization = await this.organizationRepository.create({
        ...data,
        code,
        ownerId
      }, { session });

      // Create the system owner membership
      await this.organizationMemberRepository.create({
        organizationId: organization._id,
        userId: ownerId,
        role: PRESET_ROLES.OWNER,
        isSystemOwner: true,
        status: 'ACTIVE'
      }, { session });

      await this.auditLogService.log({
        userId: ownerId,
        action: 'ORGANIZATION_CREATED',
        entityType: 'Organization',
        entityId: organization._id,
        details: `Organization ${organization.name} created.`
      });

      // Create Free Trial Subscription
      try {
        await this.subscriptionService.createTrialSubscription('ORGANIZATION', organization._id, ownerId, { session });
      } catch (err) {
        console.error('[OrganizationService] Failed to create trial subscription:', err);
        // We don't block organization creation, but log the error
      }

      // Automatically seed the default roles for this new organization
      try {
        await this.roleService.seedDefaultRolesForOrganization(organization._id, { session });
      } catch (err) {
        console.error('[OrganizationService] Failed to seed default roles:', err);
      }

      return organization;
    });
  }

  async getOrganizationDetails(orgId) {
    const org = await this.organizationRepository.findOne({ _id: orgId, isDeleted: { $ne: true } });
    if (!org) throw new NotFoundError("Organization not found");
    return org;
  }

  async updateOrganization(orgId, updateData, userId) {
    const org = await this.organizationRepository.findOne({ _id: orgId, isDeleted: { $ne: true } });
    if (!org) throw new NotFoundError("Organization not found");

    const updatedOrg = await this.organizationRepository.updateById(orgId, updateData);
    
    await this.auditLogService.log({
      userId,
      organizationId: orgId,
      action: 'ORGANIZATION_UPDATED',
      entityType: 'Organization',
      entityId: orgId,
      details: 'Organization settings updated.'
    });

    return updatedOrg;
  }

  async deleteOrganization(orgId, userId) {
    const org = await this.organizationRepository.findOne({ _id: orgId, isDeleted: { $ne: true } });
    if (!org) throw new NotFoundError("Organization not found");

    const deletedOrg = await this.organizationRepository.updateById(orgId, {
      isDeleted: true,
      status: 'inactive'
    });

    await this.auditLogService.log({
      userId,
      organizationId: orgId,
      action: 'ORGANIZATION_DELETED',
      entityType: 'Organization',
      entityId: orgId,
      details: `Organization ${org.name} was soft-deleted.`
    });

    return deletedOrg;
  }

  async getMyOrganizations(userId) {
    const memberships = await this.organizationMemberRepository.findMany({ userId, status: 'ACTIVE' }, { populate: 'organizationId' });
    return memberships.map(m => m.organizationId);
  }

  async updateLimits(orgId, { maxBranches, maxUsers, maxProducts, storageLimit }, userId) {
    const org = await this.organizationRepository.findOne({ _id: orgId });
    if (!org) throw new NotFoundError("Organization not found");
    
    const before = org.limitsOverride || {};
    
    const newOverrides = { ...before };
    if (maxBranches !== undefined) newOverrides.maxBranches = maxBranches;
    if (maxUsers !== undefined) newOverrides.maxUsers = maxUsers;
    if (maxProducts !== undefined) newOverrides.maxProducts = maxProducts;
    if (storageLimit !== undefined) newOverrides.storageLimit = storageLimit;
    
    org.limitsOverride = newOverrides;
    await this.organizationRepository.updateById(orgId, org);
    
    await this.auditLogService.log({
      action: 'ORGANIZATION_LIMIT_UPDATED',
      ownerType: 'ORGANIZATION',
      ownerId: orgId,
      userId: userId,
      notes: 'Admin updated organization limits',
      metadata: {
        before,
        after: newOverrides
      }
    });

    return org;
  }
}

module.exports = OrganizationService;
