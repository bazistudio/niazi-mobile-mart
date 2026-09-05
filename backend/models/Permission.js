const mongoose = require("mongoose");
const baseUuidSchema = require("./plugins/baseUuidSchema");

const permissionSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    index: true, // e.g., 'products.create'
  },
  module: {
    type: String,
    required: true, // e.g., 'products'
  },
  action: {
    type: String,
    required: true, // e.g., 'create'
  },
  description: {
    type: String
  }
});

permissionSchema.plugin(baseUuidSchema);

module.exports = mongoose.model("Permission", permissionSchema);
