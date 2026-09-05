const Subscription = require('../models/Subscription');

class SubscriptionRepository {
  async findById(id) {
    return Subscription.findById(id).populate('packageId');
  }

  async findByOwner(ownerType, ownerId) {
    return Subscription.findOne({ ownerType, ownerId, status: { $ne: 'CANCELLED' } }).populate('packageId');
  }

  async find(query = {}, options = {}) {
    const { skip = 0, limit = 50, sort = { createdAt: -1 }, skipTenantGuard = false } = options;
    const q = Subscription.find(query)
      .populate('packageId')
      .sort(sort)
      .skip(skip)
      .limit(limit);
    if (skipTenantGuard) q.setOptions({ skipTenantGuard: true });
    return q;
  }

  async count(query = {}, options = {}) {
    const q = Subscription.countDocuments(query);
    if (options.skipTenantGuard) q.setOptions({ skipTenantGuard: true });
    return q;
  }

  async create(data) {
    return Subscription.create(data);
  }

  async update(id, updateData) {
    return Subscription.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).populate('packageId');
  }

  async delete(id) {
    return Subscription.findByIdAndDelete(id);
  }
}

module.exports = new SubscriptionRepository();
