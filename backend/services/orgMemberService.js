class OrgMemberService {
  constructor(organizationMemberRepository, auditLogService) {
    this.organizationMemberRepository = organizationMemberRepository;
    this.auditLogService = auditLogService;
  }

  async addMember(organizationId, userId, data, actorId) {
    const member = await this.organizationMemberRepository.create({
      organizationId,
      userId,
      role: data.role,
      permissions: data.permissions || [],
      shopAccess: data.shopAccess || [],
      status: 'ACTIVE'
    });

    await this.auditLogService.log({
      userId: actorId,
      action: 'MEMBER_ADDED',
      entityType: 'OrganizationMember',
      entityId: member._id,
      details: `User ${userId} added with role ${data.role}`
    });

    return member;
  }

  async updateMember(memberId, organizationId, data, actorId) {
    const member = await this.organizationMemberRepository.findOne({ _id: memberId, organizationId });
    if (!member) {
      throw new Error("Organization member not found in your organization");
    }

    // Prevent non-owners from modifying owner roles
    if (member.role === 'OWNER' && member.userId.toString() !== actorId.toString()) {
      const actorMember = await this.organizationMemberRepository.findOne({ organizationId, userId: actorId });
      if (!actorMember || (!actorMember.isSystemOwner && actorMember.role !== 'OWNER')) {
        throw new Error("Forbidden: Only an organization owner can modify another owner's role");
      }
    }

    const updates = {};
    if (data.role !== undefined) updates.role = data.role;
    if (data.permissions !== undefined) updates.permissions = data.permissions;
    if (data.shopAccess !== undefined) updates.shopAccess = data.shopAccess;
    if (data.status !== undefined) updates.status = data.status;

    const updated = await this.organizationMemberRepository.updateById(memberId, updates);

    await this.auditLogService.log({
      userId: actorId,
      action: 'MEMBER_UPDATED',
      entityType: 'OrganizationMember',
      entityId: memberId,
      details: `Member settings/roles updated for user ${member.userId}`
    });

    return updated;
  }

  async removeMember(memberId, organizationId, actorId) {
    const member = await this.organizationMemberRepository.findOne({ _id: memberId, organizationId });
    if (!member) {
      throw new Error("Organization member not found in your organization");
    }

    if (member.isSystemOwner || member.role === 'OWNER') {
      const activeOwners = await this.organizationMemberRepository.countDocuments({
        organizationId,
        $or: [{ role: 'OWNER' }, { isSystemOwner: true }],
        status: 'ACTIVE'
      });
      if (activeOwners <= 1) {
        throw new Error("Cannot remove the last remaining owner of the organization");
      }
    }

    member.status = 'SUSPENDED';
    await this.organizationMemberRepository.updateById(memberId, { status: 'SUSPENDED' });

    await this.auditLogService.log({
      userId: actorId,
      action: 'MEMBER_REMOVED',
      entityType: 'OrganizationMember',
      entityId: memberId,
      details: `Member ${member.userId} removed/suspended from organization`
    });

    return { message: "Member removed from organization successfully" };
  }
  
  async getMembers(organizationId) {
    return await this.organizationMemberRepository.findMany({ organizationId }, { populate: { path: 'userId', select: 'name email phone' } });
  }
}

module.exports = OrgMemberService;

