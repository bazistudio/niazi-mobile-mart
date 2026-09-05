const mongoose = require('mongoose');

module.exports = function paginationPlugin(schema) {
  schema.statics.paginate = async function (filter = {}, options = {}) {
    const page = parseInt(options.page, 10) || 1;
    const limit = parseInt(options.limit, 10) || 10;
    const skip = (page - 1) * limit;
    const sort = options.sort || { createdAt: -1 };

    // Support projection, lean, populate
    const projection = options.projection || null;
    const isLean = options.lean !== false; // default true
    
    let query = this.find(filter, projection)
      .sort(sort)
      .skip(skip)
      .limit(limit);

    if (isLean) {
      query = query.lean();
    }
    
    if (options.populate) {
      query = query.populate(options.populate);
    }

    const [data, total] = await Promise.all([
      query.exec(),
      this.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    };
  };
};
