const ShopSettings = require('../models/ShopSettings');

exports.getSettings = async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.tenantId;
    const shopId = req.user.shopId || req.shopId || tenantId;

    let settings = await ShopSettings.findOne({ shopId, tenantId });

    if (!settings) {
      settings = await ShopSettings.create({
        tenantId,
        shopId,
        printerVersion: 2
      });
    } else {
      // V1 to V2 Printer Migration Fallback
      if (!settings.printerVersion || settings.printerVersion < 2) {
        const oldPrinter = settings.printer || {};
        settings.printer = {
          enabled: oldPrinter.enabled !== false,
          printerType: oldPrinter.paperSize === '58mm' ? 'THERMAL_58MM' : 'THERMAL_80MM',
          connectionType: 'BROWSER_PRINT',
          paperSize: { width: oldPrinter.paperSize || '80mm' },
          layout: { orientation: 'portrait', marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
          font: { size: 12, family: 'monospace' },
          invoice: {
            showLogo: false,
            showShopInfo: true,
            showBarcode: true,
            showQR: false,
            showTax: true,
            showDiscount: true
          },
          autoPrint: oldPrinter.autoPrint || false,
          printCopyCount: 1
        };
        settings.printerVersion = 2;
        await settings.save();
      }
    }

    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.tenantId;
    const shopId = req.user.shopId || req.shopId || tenantId;
    const updates = req.body;

    const settings = await ShopSettings.findOneAndUpdate(
      { shopId, tenantId },
      { $set: updates },
      { new: true, upsert: true }
    );

    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
