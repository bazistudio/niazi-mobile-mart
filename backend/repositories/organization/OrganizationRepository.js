const BaseRepository = require('../BaseRepository');
const Organization = require('../../models/Organization');

class OrganizationRepository extends BaseRepository {
  constructor() {
    super(Organization);
  }

  async findBySlug(slug, options = {}) {
    return await this.findOne({ slug }, options);
  }
}

module.exports = OrganizationRepository;
