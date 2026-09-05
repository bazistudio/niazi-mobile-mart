const mongoose = require("mongoose");
const baseUuidSchema = require("./plugins/baseUuidSchema");

const aiJobSchema = new mongoose.Schema({
  organizationId: {
    type: String, // UUID
    required: true,
    index: true,
  },
  taskType: { type: String, required: true }, // e.g., "Invoice OCR", "Demand Prediction"
  status: { type: String, enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED"], default: "PENDING" },
  input: { type: mongoose.Schema.Types.Mixed },
  output: { type: mongoose.Schema.Types.Mixed }
});

aiJobSchema.index({ organizationId: 1, status: 1 });

aiJobSchema.plugin(baseUuidSchema);

module.exports = mongoose.model("AIJob", aiJobSchema);
