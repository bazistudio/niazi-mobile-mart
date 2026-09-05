const mongoose = require('mongoose');

module.exports = function auditTrailPlugin(schema) {
  schema.add({
    createdBy: { type: String, ref: 'User' },
    updatedBy: { type: String, ref: 'User' }
  });
  
  // Note: Populate updatedBy/createdBy will typically happen at the controller/service
  // layer via the request context, but defining the fields here standardizes them.
};
