const BaseRepository = require('../BaseRepository');
const RoleMatrix = require('../../models/RoleMatrix');

class RoleMatrixRepository extends BaseRepository {
  constructor() {
    super(RoleMatrix);
  }
}

module.exports = RoleMatrixRepository;
