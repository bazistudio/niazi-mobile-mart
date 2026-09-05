const BaseRepository = require('../BaseRepository');
const Package = require('../../models/Package');

class PackageRepository extends BaseRepository {
  constructor() {
    super(Package);
  }
}

module.exports = PackageRepository;
