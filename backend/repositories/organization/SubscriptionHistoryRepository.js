const BaseRepository = require('../BaseRepository');
const SubscriptionHistory = require('../../models/SubscriptionHistory');

class SubscriptionHistoryRepository extends BaseRepository {
  constructor() {
    super(SubscriptionHistory);
  }
}

module.exports = SubscriptionHistoryRepository;
