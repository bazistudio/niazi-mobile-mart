const BaseRepository = require('../BaseRepository');
const Branch = require('../../models/Branch');

class BranchRepository extends BaseRepository {
  constructor() {
    super(Branch);
  }

  async findByOrganizationId(organizationId, options = {}) {
    return await this.findMany({ organizationId }, options);
  }
}

module.exports = BranchRepository;
