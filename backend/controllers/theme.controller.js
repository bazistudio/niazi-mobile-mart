const themeService = require('../services/theme.service');

/**
 * GET /api/v1/theme/current
 * Returns the resolved theme for the currently authenticated user.
 * Backend handles all inheritance logic transparently.
 */
exports.getCurrentTheme = async (req, res) => {
  try {
    const organizationId = req.organizationId || req.user.tenantId;
    const branchId = req.branchId || req.user.shopId;
    const accountType = req.accountType || req.user.accountType;

    const theme = await themeService.getCurrentTheme({ organizationId, branchId, accountType });

    return res.status(200).json({
      success: true,
      data: theme,
    });
  } catch (err) {
    console.error('[ThemeController] getCurrentTheme error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * PATCH /api/v1/theme
 * Updates the theme for the currently authenticated organization.
 * Accepts: { mode?, colors?: { background?, surface?, primary?, secondary? } }
 */
exports.updateTheme = async (req, res) => {
  try {
    const organizationId = req.organizationId || req.user.tenantId;
    const themeUpdate = req.body;

    const updatedTheme = await themeService.updateTheme({ organizationId }, themeUpdate);

    return res.status(200).json({
      success: true,
      message: 'Theme updated successfully',
      data: updatedTheme,
    });
  } catch (err) {
    const status = err.message.startsWith('Invalid') ? 400 : 500;
    console.error('[ThemeController] updateTheme error:', err.message);
    return res.status(status).json({ success: false, message: err.message });
  }
};
