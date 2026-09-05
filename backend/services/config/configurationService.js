const BusinessSettings = require('../../models/BusinessSettings');
const SecuritySettings = require('../../models/SecuritySettings');
const LocalizationSettings = require('../../models/LocalizationSettings');
const InvoiceSettings = require('../../models/InvoiceSettings');
const PrinterSettings = require('../../models/PrinterSettings');
const NotificationSettings = require('../../models/NotificationSettings');
const BranchSettings = require('../../models/BranchSettings');

class ConfigurationService {
  constructor() {
    this.cache = new Map();
  }

  getCacheKey(organizationId, type, branchId = null) {
    return branchId ? `${organizationId}:${type}:${branchId}` : `${organizationId}:${type}`;
  }

  async getSettings(organizationId, type, model, branchId = null) {
    const key = this.getCacheKey(organizationId, type, branchId);
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    const query = { organizationId };
    if (branchId) query.branchId = branchId;

    let settings = await model.findOne(query).lean();
    if (!settings) {
      // Create defaults
      settings = await model.create(query);
      settings = settings.toObject();
    }

    this.cache.set(key, settings);
    return settings;
  }

  async updateSettings(organizationId, type, model, data, branchId = null) {
    const query = { organizationId };
    if (branchId) query.branchId = branchId;

    const settings = await model.findOneAndUpdate(query, { $set: data }, { new: true, upsert: true }).lean();
    const key = this.getCacheKey(organizationId, type, branchId);
    this.cache.set(key, settings);
    return settings;
  }

  async getBusinessSettings(organizationId) { return this.getSettings(organizationId, 'Business', BusinessSettings); }
  async getSecuritySettings(organizationId) { return this.getSettings(organizationId, 'Security', SecuritySettings); }
  async getLocalizationSettings(organizationId) { return this.getSettings(organizationId, 'Localization', LocalizationSettings); }
  async getInvoiceSettings(organizationId) { return this.getSettings(organizationId, 'Invoice', InvoiceSettings); }
  async getPrinterSettings(organizationId) { return this.getSettings(organizationId, 'Printer', PrinterSettings); }
  async getNotificationSettings(organizationId) { return this.getSettings(organizationId, 'Notification', NotificationSettings); }
  async getBranchSettings(organizationId, branchId) { return this.getSettings(organizationId, 'Branch', BranchSettings, branchId); }

  async updateBusinessSettings(organizationId, data) { return this.updateSettings(organizationId, 'Business', BusinessSettings, data); }
  async updateSecuritySettings(organizationId, data) { return this.updateSettings(organizationId, 'Security', SecuritySettings, data); }
  async updateBranchSettings(organizationId, branchId, data) { return this.updateSettings(organizationId, 'Branch', BranchSettings, data, branchId); }

  invalidateCache(organizationId, type, branchId = null) {
    this.cache.delete(this.getCacheKey(organizationId, type, branchId));
  }
}

module.exports = new ConfigurationService();
