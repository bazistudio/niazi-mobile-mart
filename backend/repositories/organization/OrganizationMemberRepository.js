const BaseRepository = require('../BaseRepository');
const OrganizationMember = require('../../models/OrganizationMember');

class OrganizationMemberRepository extends BaseRepository {
  constructor() {
    super(OrganizationMember);
  }

  async findByUserAndOrganization(userId, organizationId, options = {}) {
    return await this.findOne({ userId, organizationId }, options);
  }
}

module.exports = OrganizationMemberRepository;
