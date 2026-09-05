const Organization = require('../models/Organization');
const Branch = require('../models/Branch');

const DEFAULT_THEME = {
  mode: 'light',
  colors: {
    background: '#f8fafc',
    surface: '#ffffff',
    primary: '#006970',
    secondary: '#00b4bb',
  },
  branding: {
    logo: '',
    favicon: '',
  },
};

/**
 * Returns the active theme for the requesting user.
 * Resolution order:
 *  1. If SINGLE_SHOP  → Use Organization.theme directly.
 *  2. If ORGANIZATION → Branch inherits from Organization unless inheritFromParent=false.
 */
async function getCurrentTheme({ organizationId, branchId, accountType }) {
  const org = await Organization.findById(organizationId).select('theme themeVersion accountType').lean();
  if (!org) throw new Error('Organization not found');

  const orgTheme = org.theme || DEFAULT_THEME;

  // SINGLE_SHOP: no branch-level override, just use org theme
  if (accountType === 'SINGLE_SHOP' || !branchId || branchId === organizationId) {
    return {
      source: 'organization',
      themeVersion: org.themeVersion || 1,
      ...orgTheme,
    };
  }

  // ORGANIZATION: check branch inheritance
  const branch = await Branch.findById(branchId).select('theme themeVersion').lean();
  if (!branch) {
    return { source: 'organization', themeVersion: org.themeVersion || 1, ...orgTheme };
  }

  const inheritFromParent = branch.theme?.inheritFromParent !== false;

  if (inheritFromParent) {
    return {
      source: 'organization',
      themeVersion: org.themeVersion || 1,
      ...orgTheme,
    };
  }

  // Branch has its own custom theme
  return {
    source: 'branch',
    themeVersion: branch.themeVersion || 1,
    ...(branch.theme || DEFAULT_THEME),
  };
}

/**
 * Saves theme to the correct entity.
 * Admins of SINGLE_SHOP update the Organization.
 * Org admins update Organization.
 */
async function updateTheme({ organizationId }, themeUpdate) {
  // Validate — never allow arbitrary CSS or unknown color keys
  const ALLOWED_COLOR_KEYS = ['background', 'surface', 'primary', 'secondary', 'text'];
  const ALLOWED_TEXT_COLOR_KEYS = ['primary', 'secondary', 'muted', 'disabled'];

  const colorPattern = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$|^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/;

  if (themeUpdate.colors) {
    const unknownKeys = Object.keys(themeUpdate.colors).filter(k => !ALLOWED_COLOR_KEYS.includes(k));
    if (unknownKeys.length > 0) {
      throw new Error(`Invalid color keys: ${unknownKeys.join(', ')}`);
    }

    for (const [key, value] of Object.entries(themeUpdate.colors)) {
      if (key === 'text' && typeof value === 'object' && value !== null) {
        const unknownTextKeys = Object.keys(value).filter(k => !ALLOWED_TEXT_COLOR_KEYS.includes(k));
        if (unknownTextKeys.length > 0) {
          throw new Error(`Invalid text color keys: ${unknownTextKeys.join(', ')}`);
        }
        for (const [textKey, textValue] of Object.entries(value)) {
          if (textValue && !colorPattern.test(textValue)) {
            throw new Error(`Invalid color value for "text.${textKey}": "${textValue}". Only hex or rgb() values are allowed.`);
          }
        }
      } else if (key !== 'text') {
        if (value && !colorPattern.test(value)) {
          throw new Error(`Invalid color value for "${key}": "${value}". Only hex or rgb() values are allowed.`);
        }
      }
    }
  }

  if (themeUpdate.typography) {
    if (themeUpdate.typography.mode && !['auto', 'custom'].includes(themeUpdate.typography.mode)) {
      throw new Error(`Invalid typography mode: ${themeUpdate.typography.mode}`);
    }
  }

  const updatePayload = {};
  if (themeUpdate.mode) updatePayload['theme.mode'] = themeUpdate.mode;
  
  if (themeUpdate.typography?.mode) {
    updatePayload['theme.typography.mode'] = themeUpdate.typography.mode;
  }

  if (themeUpdate.colors) {
    for (const [key, value] of Object.entries(themeUpdate.colors)) {
      if (key === 'text' && typeof value === 'object' && value !== null) {
        for (const [textKey, textValue] of Object.entries(value)) {
          updatePayload[`theme.colors.text.${textKey}`] = textValue;
        }
      } else {
        updatePayload[`theme.colors.${key}`] = value;
      }
    }
  }

  // V1: Only org-level theme updates
  const org = await Organization.findByIdAndUpdate(
    organizationId,
    { $set: updatePayload },
    { new: true }
  ).select('theme themeVersion').lean();

  if (!org) throw new Error('Organization not found');

  return {
    source: 'organization',
    themeVersion: org.themeVersion || 1,
    ...org.theme,
  };
}

module.exports = { getCurrentTheme, updateTheme, DEFAULT_THEME };
