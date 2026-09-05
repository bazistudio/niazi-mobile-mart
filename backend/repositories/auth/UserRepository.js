const BaseRepository = require('../BaseRepository');
const User = require('../../models/User');

class UserRepository extends BaseRepository {
  constructor() {
    super(User);
  }

  async findByEmail(email, options = {}) {
    return await this.findOne({ email }, options);
  }

  async findByUsername(username, options = {}) {
    return await this.findOne({ username }, options);
  }

  async findByOrganizationAndUsername(organizationId, username, options = {}) {
    return await this.findOne({ organizationId, username }, options);
  }
}

module.exports = UserRepository;
