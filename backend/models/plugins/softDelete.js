const mongoose = require('mongoose');

module.exports = function softDeletePlugin(schema) {
  if (!schema.paths.status) {
    schema.add({
      status: { 
        type: String, 
        enum: ['active', 'inactive', 'draft', 'suspended'], 
        default: 'active',
        index: true
      }
    });
  }
  schema.add({
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date }
  });

  const excludeDeleted = function () {
    if (this.getQuery().isDeleted === undefined) {
      this.where({ isDeleted: { $ne: true } });
    }
  };

  schema.pre('find', excludeDeleted);
  schema.pre('findOne', excludeDeleted);
  schema.pre('findOneAndUpdate', excludeDeleted);
  schema.pre('countDocuments', excludeDeleted);
  schema.pre('updateMany', excludeDeleted);

  schema.pre('aggregate', function () {
    const pipeline = this.pipeline();
    const firstStage = pipeline.length > 0 ? Object.keys(pipeline[0])[0] : null;
    
    const specialFirstStages = ['$geoNear', '$indexStats', '$search'];
    
    if (firstStage && specialFirstStages.includes(firstStage)) {
      pipeline.splice(1, 0, { $match: { isDeleted: { $ne: true } } });
    } else {
      pipeline.unshift({ $match: { isDeleted: { $ne: true } } });
    }
  });

  schema.methods.softDelete = function () {
    this.isDeleted = true;
    this.deletedAt = new Date();
    return this.save();
  };

  schema.methods.restore = function () {
    this.isDeleted = false;
    this.deletedAt = undefined;
    return this.save();
  };

  schema.methods.hardDelete = function () {
    return this.deleteOne();
  };
};
