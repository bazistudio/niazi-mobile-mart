const ShopProfile = require('../models/ShopProfile');

class ShopProfileRepository {
  async findById(uuid) {
    return await ShopProfile.findOne({ uuid });
  }

  async findByOrganization(organizationId) {
    return await ShopProfile.find({ organizationId });
  }
}

module.exports = ShopProfileRepository;
