const crypto = require('crypto');
const MediaLibrary = require('../../models/MediaLibrary');

class StorageService {
  constructor() {
    // Current default provider configuration
    this.provider = process.env.STORAGE_PROVIDER || "LOCAL";
  }

  /**
   * Mock upload to external storage
   * In reality, this would use AWS SDK, GCS Client, etc.
   */
  async _uploadToExternalStorage(fileBuffer, mimeType, extension, folder) {
    const fileName = `${crypto.randomUUID()}.${extension}`;
    const storagePath = `${folder}/${fileName}`;

    return {
      storageProvider: this.provider,
      storageBucket: "tijaratpro-assets",
      storagePath,
      storageKey: fileName,
      url: `https://storage.tijaratpro.com/${storagePath}`
    };
  }

  /**
   * Upload file and register in MediaLibrary
   */
  async uploadFile(payload, organizationId, userId) {
    const { 
      fileBuffer, 
      originalFileName, 
      mimeType, 
      extension, 
      folder = "uploads",
      isPublic = false,
      entityType,
      entityId 
    } = payload;

    // 1. Calculate checksum
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    const checksum = hashSum.digest('hex');
    const size = fileBuffer.length;

    // 2. Duplicate detection within the tenant
    const existingMedia = await MediaLibrary.findOne({ organizationId, checksum });
    if (existingMedia) {
      // Option: Return the existing media directly to save storage space
      return existingMedia;
    }

    // 3. Upload to actual storage (Mocked)
    const storageData = await this._uploadToExternalStorage(fileBuffer, mimeType, extension, folder);

    // 4. Save metadata to MongoDB
    const media = new MediaLibrary({
      organizationId,
      uploadedBy: userId,
      createdBy: userId,
      updatedBy: userId,
      fileName: storageData.storageKey,
      originalFileName,
      mimeType,
      extension,
      size,
      checksum,
      storageProvider: storageData.storageProvider,
      storageBucket: storageData.storageBucket,
      storagePath: storageData.storagePath,
      storageKey: storageData.storageKey,
      url: storageData.url,
      folder,
      isPublic,
      entityType,
      entityId
    });

    await media.save();
    return media;
  }

  /**
   * Generate secure download URL (Pre-signed URL mock)
   */
  async getSecureUrl(mediaId, organizationId) {
    const media = await MediaLibrary.findOne({ _id: mediaId, organizationId });
    if (!media) throw new Error("Media not found");

    if (media.isPublic) {
      return media.url;
    }

    // Mock generating a secure token valid for 1 hour
    const token = crypto.randomBytes(16).toString('hex');
    return `${media.url}?secureToken=${token}&expires=${Date.now() + 3600000}`;
  }
}

module.exports = new StorageService();
