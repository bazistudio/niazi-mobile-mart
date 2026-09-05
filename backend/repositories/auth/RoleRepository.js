const BaseRepository = require('../BaseRepository');
const Role = require('../../models/Role');

class RoleRepository extends BaseRepository {
  constructor() {
    super(Role);
  }

  async findByNameAndOrganization(name, organizationId, options = {}) {
    return await this.findOne({ name, organizationId }, options);
  }
}

module.exports = RoleRepository;
