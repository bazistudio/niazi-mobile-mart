const SystemSettings = require('../../models/SystemSettings');

async function seedSystemConfig() {
  const existing = await SystemSettings.findOne({ singleton: 'CONFIG' }).setOptions({ skipTenantGuard: true });
  if (!existing) {
    await SystemSettings.create({
      singleton: 'CONFIG',
      trialDays: 15,
      pricing: {
        monthlyPrice: 5000,
        yearlyPrice: 50000
      },
      maintenanceMode: false,
      allowRegistrations: true,
      contactInfo: {
        whatsappNumber: '+923000000000',
        supportEmail: 'support@tijaratpro.com'
      }
    });
    return 1;
  }
  return 0;
}

module.exports = seedSystemConfig;
