const mongoose = require("mongoose");
const baseUuidSchema = require("./plugins/baseUuidSchema");

const processedRequestSchema = new mongoose.Schema({
  organizationId: {
    type: String, // UUID
    required: true,
    index: true,
  },
  key: {
    type: String,
    required: true,
    index: true,
  },
  method: {
    type: String,
    required: true,
  },
  url: {
    type: String,
    required: true,
  },
  status: {
    type: Number,
    required: true,
  },
  response: {
    type: mongoose.Schema.Types.Mixed, // Stores the JSON response
    required: true,
  },
  userId: {
    type: String, // UUID
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 } // TTL Index
  }
});

processedRequestSchema.index({ key: 1, organizationId: 1 }, { unique: true });

processedRequestSchema.plugin(baseUuidSchema);

module.exports = mongoose.model("ProcessedRequest", processedRequestSchema);
