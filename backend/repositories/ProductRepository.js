const Product = require('../models/Product');
const { withContext } = require('./repositoryHelper');

class ProductRepository {
  async findById(id) {
    return Product.findOne(withContext({ _id: id }));
  }

  async find(query = {}, options = {}) {
    const { skip = 0, limit = 50, sort = { createdAt: -1 } } = options;
    return Product.find(withContext(query))
      .sort(sort)
      .skip(skip)
      .limit(limit);
  }

  async count(query = {}) {
    return Product.countDocuments(withContext(query));
  }

  async create(data) {
    const store = require('../middleware/context/asyncContext').getStore();
    return Product.create({
      ...data,
      organizationId: store.organizationId,
      shopId: store.shopId,
    });
  }

  async update(id, updateData) {
    return Product.findOneAndUpdate(
      withContext({ _id: id }),
      { $set: updateData },
      { new: true, runValidators: true }
    );
  }

  async delete(id) {
    return Product.findOneAndDelete(withContext({ _id: id }));
  }
}

module.exports = new ProductRepository();
