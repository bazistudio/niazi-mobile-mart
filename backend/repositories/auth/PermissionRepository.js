const BaseRepository = require('../BaseRepository');
const Permission = require('../../models/Permission');

class PermissionRepository extends BaseRepository {
  constructor() {
    super(Permission);
  }

  async findByResourceAndAction(resource, action, options = {}) {
    return await this.findOne({ resource, action }, options);
  }
}

module.exports = PermissionRepository;
