const mongoose = require('mongoose');

module.exports = function timestampsPlugin(schema) {
  schema.add({
    createdAt: { type: Date },
    updatedAt: { type: Date }
  });

  schema.pre('save', function () {
    const now = new Date();
    if (this.isNew && !this.createdAt) {
      this.createdAt = now;
    }
    this.updatedAt = now;
  });

  schema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function () {
    this.set({ updatedAt: new Date() });
  });
};
