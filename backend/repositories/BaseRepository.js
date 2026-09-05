class BaseRepository {
  constructor(model) {
    this.model = model;
  }

  async create(data, options = {}) {
    const doc = new this.model(data);
    return await doc.save(options);
  }

  async createMany(dataArray, options = {}) {
    return await this.model.insertMany(dataArray, options);
  }

  async findById(id, options = {}) {
    const query = this.model.findById(id);
    this._applyOptions(query, options);
    return await query.exec();
  }

  async findOne(filter = {}, options = {}) {
    const query = this.model.findOne(filter);
    this._applyOptions(query, options);
    return await query.exec();
  }

  async findMany(filter = {}, options = {}) {
    const query = this.model.find(filter);
    this._applyOptions(query, options);
    return await query.exec();
  }

  async paginate(filter = {}, options = {}) {
    const { page = 1, limit = 10, sort = { createdAt: -1 }, ...restOptions } = options;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.findMany(filter, { ...restOptions, sort, skip, limit }),
      this.count(filter)
    ]);

    return {
      data,
      metadata: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async updateById(id, data, options = { new: true }) {
    return await this.model.findByIdAndUpdate(id, data, options).exec();
  }

  async updateMany(filter = {}, data, options = {}) {
    return await this.model.updateMany(filter, data, options).exec();
  }

  async softDelete(id, options = {}) {
    return await this.updateById(id, { status: 'DELETED', deletedAt: new Date() }, options);
  }

  async restore(id, options = {}) {
    return await this.updateById(id, { status: 'ACTIVE', deletedAt: null }, options);
  }

  async exists(filter = {}) {
    return await this.model.exists(filter);
  }

  async count(filter = {}) {
    return await this.model.countDocuments(filter).exec();
  }

  async aggregate(pipeline = []) {
    return await this.model.aggregate(pipeline).exec();
  }

  async transaction(callback) {
    // MongoDB standalone instances do not support ACID transactions.
    // If we are running locally without a replica set, fallback to non-transactional execution.
    const topologyType = this.model.db.client.topology?.description?.type;
    const isStandalone = topologyType === 'Single' || topologyType === 'Unknown';
    
    if (isStandalone) {
      return await callback(null);
    }

    const session = await this.model.db.startSession();
    session.startTransaction();
    try {
      const result = await callback(session);
      await session.commitTransaction();
      return result;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  _applyOptions(query, options) {
    if (options.select) query.select(options.select);
    if (options.populate) query.populate(options.populate);
    if (options.sort) query.sort(options.sort);
    if (options.limit) query.limit(options.limit);
    if (options.skip) query.skip(options.skip);
    if (options.lean !== false) query.lean(); // Default to lean for performance
    if (options.session) query.session(options.session);
    if (options.skipTenantGuard) query.setOptions({ skipTenantGuard: true });
  }
}

module.exports = BaseRepository;
