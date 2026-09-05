const mongoose = require('mongoose');
const crypto = require('crypto');

module.exports = function baseFieldsPlugin(schema) {
  schema.add({
    schemaVersion: { type: Number, default: 1 },
    syncId: { type: String, sparse: true, index: true }
  });
};
