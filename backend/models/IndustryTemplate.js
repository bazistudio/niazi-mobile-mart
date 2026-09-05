const mongoose = require("mongoose");

const industryTemplateSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      unique: true,
      // e.g., "PHARMACY", "AUTO_PARTS", "GENERAL_STORE", "ELECTRONICS"
    },
    modules: [{
      type: String,
      // e.g., "batch_tracking", "expiry_management", "warranty_management"
    }],
    dashboardWidgets: [{
      type: String,
      // e.g., "medicines_expiring_soon", "top_vehicle_models"
    }],
    productFields: [{
      name: String,
      type: { type: String }, // e.g., "text", "date", "number", "boolean"
      required: Boolean,
      options: [String], // for select/enum fields
      label: String
      // e.g., { name: "batchNumber", type: "text", required: true, label: "Batch Number" }
    }],
    reports: [{
      type: String
      // e.g., "prescription_sales", "warranty_claims"
    }]
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("IndustryTemplate", industryTemplateSchema);
