const mongoose = require("mongoose");
const applyEnterprisePlugins = require("./plugins/applyEnterprisePlugins");

const mediaLibrarySchema = new mongoose.Schema(
  {
    // Tenant context added via applyEnterprisePlugins
    
    // Audit
    uploadedBy: { type: String, ref: "User", index: true },
    createdBy: { type: String, ref: "User" },
    updatedBy: { type: String, ref: "User" },

    // File Metadata
    fileName: { type: String, required: true },
    originalFileName: { type: String },
    mimeType: { type: String, required: true },
    extension: { type: String },
    size: { type: Number, required: true }, // Bytes
    checksum: { type: String, required: true, index: true }, // SHA-256 for duplicate detection

    // External Storage Reference
    storageProvider: { type: String, required: true, enum: ["LOCAL", "S3", "GCS", "AZURE", "CLOUDINARY"] },
    storageBucket: { type: String },
    storagePath: { type: String, required: true },
    storageKey: { type: String, required: true },
    url: { type: String }, // Pre-signed or public URL
    thumbnailUrl: { type: String },

    // File Information (Optional specific metadata)
    width: { type: Number }, // For images/videos
    height: { type: Number },
    duration: { type: Number }, // For audio/video
    pages: { type: Number }, // For PDF/documents
    tags: [{ type: String, index: true }],
    folder: { type: String, default: "uploads", index: true },

    // Entity Linking (Polymorphic relationship)
    entityType: { type: String, index: true }, // e.g., "Product", "User", "Invoice"
    entityId: { type: String, index: true },

    // Access Control
    isPublic: { type: Boolean, default: false },
    status: { type: String, enum: ["ACTIVE", "PROCESSING", "ARCHIVED", "FAILED"], default: "ACTIVE" }
  },
  {
    optimisticConcurrency: true,
    versionKey: 'version'
  }
);

// Optimize checksum duplicate detection queries
mediaLibrarySchema.index({ organizationId: 1, checksum: 1 });

applyEnterprisePlugins(mediaLibrarySchema, { tenant: true, publicPrefix: "MED" });
module.exports = mongoose.model("MediaLibrary", mediaLibrarySchema);
