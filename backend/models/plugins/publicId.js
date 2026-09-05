const mongoose = require('mongoose');
const crypto = require('crypto');

async function generateUniquePublicId(model, prefix) {
  let isUnique = false;
  let newPublicId;
  let attempts = 0;

  while (!isUnique && attempts < 5) {
    const randomHex = crypto.randomBytes(6).toString('hex').toUpperCase();
    newPublicId = `${prefix}-${randomHex}`;
    
    // Check collision system-wide (bypass tenant guard)
    const exists = await model.findOne({ publicId: newPublicId }).select("_id").setOptions({ skipTenantGuard: true }).lean();
    if (!exists) {
      isUnique = true;
    }
    attempts++;
  }

  if (!isUnique) {
    throw new Error('Failed to generate a unique publicId after multiple attempts.');
  }

  return newPublicId;
}

module.exports = function publicIdPlugin(schema, options = {}) {
  const { prefix = 'DOC' } = options;

  schema.add({
    publicId: { type: String, unique: true, index: true }
  });

  schema.pre('save', async function () {
    if (this.isNew && !this.publicId) {
      const model = this.constructor;
      this.publicId = await generateUniquePublicId(model, prefix);
    }
  });
};
