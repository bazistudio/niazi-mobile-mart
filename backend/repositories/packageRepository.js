const Package = require('../models/Package');

class PackageRepository {
  async findById(id) {
    return Package.findById(id);
  }

  async find(query = {}, options = {}) {
    if (query.status === undefined) {
      query.status = 'ACTIVE';
    }
    const { skip = 0, limit = 50, sort = { createdAt: -1 } } = options;
    return Package.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit);
  }

  async count(query = {}) {
    if (query.status === undefined) {
      query.status = 'ACTIVE';
    }
    return Package.countDocuments(query);
  }

  async create(data) {
    return Package.create(data);
  }

  async update(id, updateData) {
    return Package.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );
  }

  async delete(id) {
    return Package.findByIdAndUpdate(id, { $set: { status: 'INACTIVE' } }, { new: true });
  }
}

module.exports = new PackageRepository();
