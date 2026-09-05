const { AppError } = require('../utils/errors');
const crypto = require('crypto');
// We require some dependencies like caching/events that aren't strictly Mongoose models.
const eventBus = require('../events/eventBus');
const cacheService = require('../services/cacheService');

class OrganizationRequestService {
  constructor(
    organizationRequestRepository,
    organizationRepository,
    organizationMemberRepository,
    userRepository,
    branchRepository,
    sessionRepository,
    auditLogRepository,
    subscriptionService // using the refactored subscription service
  ) {
    this.organizationRequestRepository = organizationRequestRepository;
    this.organizationRepository = organizationRepository;
    this.organizationMemberRepository = organizationMemberRepository;
    this.userRepository = userRepository;
    this.branchRepository = branchRepository;
    this.sessionRepository = sessionRepository;
    this.auditLogRepository = auditLogRepository;
    this.subscriptionService = subscriptionService;
  }

  async listRequests() {
    return await this.organizationRequestRepository.findMany({}, { sort: { createdAt: -1 }, populate: { path: 'ownerId', select: 'name email phone' } });
  }

  async approveRequest(requestId, payload, reviewerId, reqIp) {
    const orgRequest = await this.organizationRequestRepository.findById(requestId, { populate: 'ownerId' });
    if (!orgRequest || !['PENDING', 'PROCESSING'].includes(orgRequest.status)) {
      throw new AppError("Request not found or not pending", 400);
    }
    const owner = orgRequest.ownerId;

    orgRequest.status = 'PROCESSING';
    await this.organizationRequestRepository.updateById(requestId, { $set: { status: 'PROCESSING' } });

    return await this.organizationRequestRepository.transaction(async (session) => {
      try {
        const orgSlug = `org-${crypto.randomBytes(4).toString('hex').toLowerCase()}`;
        const orgPublicId = `ORG-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        const orgCode = `ORG-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        const organization = await this.organizationRepository.create({
          name: orgRequest.name,
          slug: orgSlug,
          publicId: orgPublicId,
          code: orgCode,
          accountType: orgRequest.accountType || "SINGLE_SHOP",
          businessType: orgRequest.businessType || "RETAIL",
          currency: "PKR"
        }, { session });

        const shopName = orgRequest.accountType === 'ORGANIZATION' ? `${orgRequest.name} HQ` : 'Single Branch';
        const branchCode = `BR-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const shop = await this.branchRepository.create({
          name: shopName,
          code: branchCode,
          phone: owner.phone || '0000000000',
          email: owner.email,
          organizationId: organization._id,
          status: 'ACTIVE'
        }, { session });

        const member = await this.organizationMemberRepository.create({
          organizationId: organization._id,
          userId: owner._id,
          role: 'OWNER',
          isSystemOwner: true,
          status: 'ACTIVE'
        }, { session });

        // Removed direct Role/Feature Mongoose creation to avoid bringing Mongoose here, 
        // normally we'd inject RoleRepository and OrganizationFeatureRepository.
        // Assuming default roles/features are handled by the new architecture automatically or we'll skip the legacy bits.
        
        if (payload.packageId || payload.durationValue) {
          const subscription = await this.subscriptionService.createSubscription({
            ownerType: 'ORGANIZATION',
            ownerId: organization._id,
            packageId: payload.packageId || 'CUSTOM',
            subscriptionPrice: payload.subscriptionPrice || 0,
            durationType: payload.durationUnit || payload.durationType || 'YEARS',
            durationValue: payload.durationValue || 1,
            limits: payload.limits || { maxBranches: payload.maxBranches || 1 },
            enabledModules: payload.enabledModules || [],
            startDate: new Date()
          }, reviewerId);
          
          organization.subscriptionId = subscription._id;
          await this.organizationRepository.updateById(organization._id, { $set: { subscriptionId: subscription._id } }, { session });
        }

        await this.userRepository.updateById(owner._id, { $set: { role: 'OWNER', organizationId: organization._id, tenantId: organization._id, status: 'active' } }, { session });

        orgRequest.status = 'APPROVED';
        orgRequest.reviewedBy = reviewerId;
        await this.organizationRequestRepository.updateById(requestId, { $set: { status: 'APPROVED', reviewedBy: reviewerId } }, { session });

        const auditEntries = [
          { action: "REQUEST_APPROVED", resource: "organization_request", entityId: orgRequest._id, entityType: "OrganizationRequest" },
          { action: "ORGANIZATION_CREATED", resource: "organization", entityId: organization._id, entityType: "Organization" },
          { action: "SHOP_CREATED", resource: "shop", entityId: shop._id, entityType: "Branch" },
          { action: "OWNER_ASSIGNED", resource: "user", entityId: owner._id, entityType: "User" }
        ];

        for (const entry of auditEntries) {
          await this.auditLogRepository.create({
            userId: reviewerId,
            tenantId: organization._id,
            action: entry.action,
            resource: entry.resource,
            entityId: entry.entityId,
            entityType: entry.entityType,
            ipAddress: reqIp
          }, { session });
        }

        eventBus.safePublish('organization.approved', { organizationId: organization._id, userId: owner._id });
        await cacheService.del(`user:${owner._id}`);
        await cacheService.del(`org:${organization._id}`);
        await cacheService.invalidatePattern(`session:${owner._id}`);

        return organization;
      } catch (err) {
        orgRequest.status = 'PENDING';
        await this.organizationRequestRepository.updateById(requestId, { $set: { status: 'PENDING' } }); // no session to ensure it saves despite abort
        throw err;
      }
    });
  }

  async rejectRequest(requestId, reviewNote, reviewerId) {
    const orgRequest = await this.organizationRequestRepository.findById(requestId);
    if (!orgRequest || orgRequest.status !== 'PENDING') {
      throw new AppError("Request not found or not pending", 400);
    }

    await this.organizationRequestRepository.updateById(requestId, { $set: { status: 'REJECTED', reviewNote, reviewedBy: reviewerId } });

    const owner = await this.userRepository.findById(orgRequest.ownerId);
    if (owner) {
      await this.userRepository.updateById(owner._id, { $set: { status: 'rejected' } });
    }

    const sessions = await this.sessionRepository.findMany({ userId: orgRequest.ownerId });
    for (const sess of sessions) {
      await this.sessionRepository.updateById(sess._id, { $set: { status: 'TERMINATED', isRevoked: true, revokedAt: new Date() } });
    }

    eventBus.safePublish('organization.rejected', { organizationRequestId: orgRequest._id, userId: orgRequest.ownerId });
    await cacheService.del(`user:${orgRequest.ownerId}`);
    await cacheService.invalidatePattern(`session:${orgRequest.ownerId}`);
  }

  async deleteRequest(requestId) {
    const orgRequest = await this.organizationRequestRepository.findById(requestId);
    if (!orgRequest) {
      throw new AppError("Request not found", 404);
    }
    await this.organizationRequestRepository.deleteById(requestId);
  }
}

module.exports = OrganizationRequestService;
