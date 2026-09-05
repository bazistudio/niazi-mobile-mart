const PublicProductIndex = require('../models/PublicProductIndex');

class PublicProductRepository {
  async findById(uuid) {
    return await PublicProductIndex.findOne({ uuid });
  }

  async upsert(uuid, productData) {
    return await PublicProductIndex.findOneAndUpdate(
      { uuid },
      productData,
      { upsert: true, new: true }
    );
  }

  async remove(uuid) {
    return await PublicProductIndex.findOneAndDelete({ uuid });
  }
}

module.exports = PublicProductRepository;
