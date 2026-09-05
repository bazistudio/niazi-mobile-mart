const mongoose = require("mongoose");
const applyEnterprisePlugins = require("./plugins/applyEnterprisePlugins");

const currencySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, uppercase: true, trim: true }, // e.g. USD
    symbol: { type: String, required: true }, // e.g. $
    exchangeRate: { type: Number, default: 1 }, // Against base currency
    isBase: { type: Boolean, default: false }
  },
  {
    optimisticConcurrency: true,
    versionKey: 'version'
  }
);

currencySchema.index({ organizationId: 1, code: 1 }, { unique: true });

applyEnterprisePlugins(currencySchema, { tenant: true, publicPrefix: "CUR" });

module.exports = mongoose.model("Currency", currencySchema);
