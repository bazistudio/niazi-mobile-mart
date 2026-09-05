const BaseRepository = require('../BaseRepository');
const OrganizationRequest = require('../../models/OrganizationRequest');

class OrganizationRequestRepository extends BaseRepository {
  constructor() {
    super(OrganizationRequest);
  }
}

module.exports = OrganizationRequestRepository;
