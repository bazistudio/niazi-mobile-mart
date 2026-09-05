const mongoose = require("mongoose");
const baseUuidSchema = require("./plugins/baseUuidSchema");

const aiHistorySchema = new mongoose.Schema({
  organizationId: {
    type: String, // UUID
    required: true,
    index: true,
  },
  userId: { type: String, index: true }, // UUID
  prompt: { type: String, required: true },
  response: { type: String },
  tokens: { type: Number },
  model: { type: String } // e.g., "gpt-4o", "gemini-1.5-pro"
});

aiHistorySchema.index({ organizationId: 1, createdAt: -1 });

aiHistorySchema.plugin(baseUuidSchema);

module.exports = mongoose.model("AIHistory", aiHistorySchema);
