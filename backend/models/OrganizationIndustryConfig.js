const mongoose = require("mongoose");

const organizationIndustryConfigSchema = new mongoose.Schema(
  {
    organizationId: {
      type: String,
      ref: "Organization",
      required: true,
      unique: true,
      index: true,
    },
    industryTemplateId: {
      type: String,
      ref: "IndustryTemplate",
      required: true,
    },
    enabledModules: [{
      type: String,
    }],
    disabledModules: [{
      type: String,
    }],
    customFields: [{
      name: String,
      type: { type: String }, // e.g., "text", "date", "number", "boolean"
      required: Boolean,
      options: [String],
      label: String
    }],
    widgetOverrides: [{
      widgetName: String,
      isHidden: Boolean,
      order: Number
    }]
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("OrganizationIndustryConfig", organizationIndustryConfigSchema);
