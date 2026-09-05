const mongoose = require("mongoose");
const applyEnterprisePlugins = require("./plugins/applyEnterprisePlugins");

const unitSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // e.g. Carton
    shortName: { type: String, required: true, trim: true }, // e.g. CTN
    baseUnitId: { type: String, ref: "Unit" }, // Points to Piece
    conversionRate: { type: Number, default: 1 } // e.g. 1 Carton = 10 Boxes (if baseUnit is Box)
  },
  {
    optimisticConcurrency: true,
    versionKey: 'version'
  }
);

unitSchema.index({ organizationId: 1, shortName: 1 }, { unique: true });

// Pre-save hook to prevent circular dependencies in conversions
unitSchema.pre('save', function() {
  if (this.baseUnitId && this.baseUnitId.toString() === this._id?.toString()) {
    throw new Error("A unit cannot be its own base unit");
  }
});

applyEnterprisePlugins(unitSchema, { tenant: true, publicPrefix: "UNT" });

module.exports = mongoose.model("Unit", unitSchema);
