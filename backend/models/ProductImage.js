const mongoose = require("mongoose");
const applyEnterprisePlugins = require("./plugins/applyEnterprisePlugins");

const productImageSchema = new mongoose.Schema(
  {
    productId: { type: String, ref: "Product", required: true, index: true },
    url: { type: String, required: true },
    isPrimary: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 }
  },
  {
    optimisticConcurrency: true,
    versionKey: 'version'
  }
);

// Only one primary image per product
productImageSchema.pre('save', async function() {
  if (this.isPrimary) {
    // If setting this to primary, unset others for this product
    await this.constructor.updateMany(
      { productId: this.productId, _id: { $ne: this._id } },
      { $set: { isPrimary: false } }
    );
  }
});

applyEnterprisePlugins(productImageSchema, { tenant: true, publicPrefix: "PIM" });

module.exports = mongoose.model("ProductImage", productImageSchema);
