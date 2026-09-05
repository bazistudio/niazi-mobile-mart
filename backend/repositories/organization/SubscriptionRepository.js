const BaseRepository = require('../BaseRepository');
const Subscription = require('../../models/Subscription');

class SubscriptionRepository extends BaseRepository {
  constructor() {
    super(Subscription);
  }

  async findActiveByOrganizationId(organizationId, options = {}) {
    return await this.findOne({ organizationId, status: 'ACTIVE' }, options);
  }
}

module.exports = SubscriptionRepository;
