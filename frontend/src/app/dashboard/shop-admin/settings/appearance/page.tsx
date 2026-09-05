'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useTheme } from '@/components/providers/ThemeProvider';
import toast from 'react-hot-toast';
import { Palette, RotateCcw, Save, CheckCircle, AlertTriangle, Monitor, Type, Layout, User, Bell, ChevronDown } from 'lucide-react';
import { getContrastRatio, isAccessible } from '@/lib/utils/color';

// ===========================
// COLOR PRESETS
// ===========================

const PRIMARY_PRESETS = [
  { name: 'Teal',   value: '#006970' },
  { name: 'Blue',   value: '#2563eb' },
  { name: 'Purple', value: '#7c3aed' },
  { name: 'Green',  value: '#16a34a' },
  { name: 'Orange', value: '#ea580c' },
  { name: 'Red',    value: '#dc2626' },
  { name: 'Pink',   value: '#db2777' },
  { name: 'Slate',  value: '#475569' },
];

const SECONDARY_PRESETS = [
  { name: 'Teal Light', value: '#00b4bb' },
  { name: 'Sky',        value: '#38bdf8' },
  { name: 'Violet',     value: '#a78bfa' },
  { name: 'Emerald',    value: '#34d399' },
  { name: 'Amber',      value: '#fbbf24' },
  { name: 'Rose',       value: '#fb7185' },
  { name: 'Fuchsia',    value: '#e879f9' },
  { name: 'Slate',      value: '#94a3b8' },
];

const BACKGROUND_PRESETS = [
  { name: 'Light Gray', value: '#f8fafc' },
  { name: 'White',      value: '#ffffff' },
  { name: 'Warm Gray',  value: '#f9fafb' },
  { name: 'Slate 50',   value: '#f1f5f9' },
  { name: 'Neutral',    value: '#fafafa' },
];

const TEXT_PRESETS = [
  { name: 'Gray 900', value: '#111827' },
  { name: 'Gray 800', value: '#1f2937' },
  { name: 'Gray 600', value: '#4b5563' },
  { name: 'Gray 500', value: '#6b7280' },
  { name: 'White',    value: '#ffffff' },
  { name: 'Gray 50',  value: '#f9fafb' },
  { name: 'Gray 300', value: '#d1d5db' },
];

// ===========================
// SUB-COMPONENTS
// ===========================

interface ColorSwatchProps {
  color: string;
  name: string;
  isSelected: boolean;
  onClick: () => void;
}

function ColorSwatch({ color, name, isSelected, onClick }: ColorSwatchProps) {
  return (
    <button
      id={`color-swatch-${name.toLowerCase().replace(/\s+/g, '-')}`}
      type="button"
      title={name}
      onClick={onClick}
      className="relative w-8 h-8 rounded-xl border-2 transition-all duration-150 hover:scale-110 focus-visible:scale-110"
      style={{
        backgroundColor: color,
        borderColor: isSelected ? color : 'transparent',
        boxShadow: isSelected ? `0 0 0 2px var(--color-surface), 0 0 0 4px ${color}` : 'none',
      }}
    >
      {isSelected && (
        <CheckCircle className="absolute inset-0 m-auto w-3.5 h-3.5 text-white drop-shadow mix-blend-difference" />
      )}
    </button>
  );
}

interface ColorSectionProps {
  label: string;
  description: string;
  presets: { name: string; value: string }[];
  selectedValue: string;
  onPresetClick: (value: string) => void;
  onCustomChange: (value: string) => void;
  contrastBg?: string; // If provided, shows contrast indicator
}

function ColorSection({ label, description, presets, selectedValue, onPresetClick, onCustomChange, contrastBg }: ColorSectionProps) {
  let indicator = null;
  if (contrastBg) {
    const ratio = getContrastRatio(selectedValue, contrastBg);
    const { isAA, indicator: badge } = isAccessible(ratio);
    indicator = (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
        isAA ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
      }`}>
        {badge} ({ratio.toFixed(1)}:1)
      </span>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm font-semibold text-[--color-text-primary] flex items-center gap-2">
            {label}
            {indicator}
          </p>
          <p className="text-xs text-[--color-text-muted] mt-0.5">{description}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        {presets.map((preset) => (
          <ColorSwatch
            key={preset.value}
            color={preset.value}
            name={preset.name}
            isSelected={selectedValue.toLowerCase() === preset.value.toLowerCase()}
            onClick={() => onPresetClick(preset.value)}
          />
        ))}
        {/* Divider */}
        <div className="w-px h-6 bg-[--color-border] mx-1" />
        {/* Custom picker */}
        <label
          className="relative w-8 h-8 rounded-xl border-2 border-dashed border-[--color-border] flex items-center justify-center cursor-pointer hover:border-[--color-primary] transition-colors"
          title="Custom color"
        >
          <span className="text-xs text-[--color-text-muted] select-none">+</span>
          <input
            id={`custom-${label.toLowerCase().replace(/\s+/g, '-')}`}
            type="color"
            value={selectedValue}
            onChange={(e) => onCustomChange(e.target.value)}
            className="absolute opacity-0 w-0 h-0"
          />
        </label>
        {/* Show current custom color if it's not in presets */}
        {!presets.find(p => p.value.toLowerCase() === selectedValue.toLowerCase()) && (
          <div
            className="w-8 h-8 rounded-xl border-2 border-[--color-primary]"
            style={{ backgroundColor: selectedValue }}
            title={`Custom: ${selectedValue}`}
          />
        )}
      </div>
      <p className="text-[10px] font-mono text-[--color-text-muted] uppercase">{selectedValue}</p>
    </div>
  );
}

// ===========================
// MAIN PAGE
// ===========================

export default function AppearancePage() {
  const { theme, isLoading, previewTheme, cancelPreview, saveTheme, isSaving } = useTheme();

  const [localColors, setLocalColors] = useState({
    primary:    theme?.colors?.primary    ?? '#006970',
    secondary:  theme?.colors?.secondary  ?? '#00b4bb',
    background: theme?.colors?.background ?? '#f8fafc',
    surface:    theme?.colors?.surface    ?? '#ffffff',
    text: {
      primary:  theme?.colors?.text?.primary  ?? '#111827',
      secondary:theme?.colors?.text?.secondary?? '#4b5563',
      muted:    theme?.colors?.text?.muted    ?? '#6b7280',
      disabled: theme?.colors?.text?.disabled ?? '#9ca3af',
    }
  });

  const [typographyMode, setTypographyMode] = useState<'auto' | 'custom'>(theme?.typography?.mode ?? 'auto');
  const [hasChanges, setHasChanges] = useState(false);
  const [showSaveWarning, setShowSaveWarning] = useState(false);

  // Sync local state when theme loads
  React.useEffect(() => {
    if (theme?.colors) {
      setLocalColors({
        primary:    theme.colors.primary,
        secondary:  theme.colors.secondary,
        background: theme.colors.background,
        surface:    theme.colors.surface || '#ffffff',
        text: {
          primary:  theme.colors.text?.primary  || '#111827',
          secondary:theme.colors.text?.secondary|| '#4b5563',
          muted:    theme.colors.text?.muted    || '#6b7280',
          disabled: theme.colors.text?.disabled || '#9ca3af',
        }
      });
      setTypographyMode(theme.typography?.mode ?? 'auto');
    }
  }, [theme]);

  const handleColorChange = useCallback((key: 'primary' | 'secondary' | 'background' | 'surface', value: string) => {
    const updated = { ...localColors, [key]: value };
    setLocalColors(updated);
    setHasChanges(true);
    previewTheme({ colors: updated, typography: { mode: typographyMode } });
  }, [localColors, typographyMode, previewTheme]);

  const handleTextColorChange = useCallback((key: 'primary' | 'secondary' | 'muted' | 'disabled', value: string) => {
    const updated = {
      ...localColors,
      text: { ...localColors.text, [key]: value }
    };
    setLocalColors(updated);
    setHasChanges(true);
    previewTheme({ colors: updated, typography: { mode: typographyMode } });
  }, [localColors, typographyMode, previewTheme]);

  const handleModeChange = useCallback((mode: 'auto' | 'custom') => {
    setTypographyMode(mode);
    setHasChanges(true);
    previewTheme({ colors: localColors, typography: { mode } });
  }, [localColors, previewTheme]);

  const checkContrastIssues = useCallback(() => {
    if (typographyMode === 'auto') return false; // Auto always generates accessible colors
    const ratio = getContrastRatio(localColors.text.primary, localColors.background);
    return ratio < 4.5;
  }, [typographyMode, localColors]);

  const performSave = async () => {
    try {
      await saveTheme({ 
        colors: localColors,
        typography: { mode: typographyMode }
      });
      setHasChanges(false);
      setShowSaveWarning(false);
      toast.success('Theme saved successfully!');
    } catch (err) {
      toast.error('Failed to save theme. Please try again.');
    }
  };

  const handleSaveClick = () => {
    if (checkContrastIssues()) {
      setShowSaveWarning(true);
    } else {
      performSave();
    }
  };

  const handleResetBrand = useCallback(() => {
    const defaults = {
      ...localColors,
      primary:    '#006970',
      secondary:  '#00b4bb',
      background: '#f8fafc',
      surface:    '#ffffff',
    };
    setLocalColors(defaults);
    setHasChanges(true);
    previewTheme({ colors: defaults, typography: { mode: typographyMode } });
  }, [localColors, typographyMode, previewTheme]);

  const handleResetTypography = useCallback(() => {
    setTypographyMode('auto');
    const defaults = {
      ...localColors,
      text: {
        primary: '#111827',
        secondary: '#4b5563',
        muted: '#6b7280',
        disabled: '#9ca3af',
      }
    };
    setLocalColors(defaults);
    setHasChanges(true);
    previewTheme({ colors: defaults, typography: { mode: 'auto' } });
  }, [localColors, previewTheme]);

  const handleCancel = useCallback(() => {
    if (theme?.colors) {
      setLocalColors({
        primary:    theme.colors.primary,
        secondary:  theme.colors.secondary,
        background: theme.colors.background,
        surface:    theme.colors.surface || '#ffffff',
        text: {
          primary:  theme.colors.text?.primary  || '#111827',
          secondary:theme.colors.text?.secondary|| '#4b5563',
          muted:    theme.colors.text?.muted    || '#6b7280',
          disabled: theme.colors.text?.disabled || '#9ca3af',
        }
      });
      setTypographyMode(theme.typography?.mode ?? 'auto');
    }
    setHasChanges(false);
    setShowSaveWarning(false);
    cancelPreview();
  }, [theme, cancelPreview]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-8 h-8 rounded-full border-2 border-[--color-primary] border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col xl:flex-row gap-8">
      {/* Left Column: Settings */}
      <div className="space-y-8 flex-1 max-w-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--color-primary)', opacity: 0.12 }}
            >
              <Palette className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[--color-text-primary]">Appearance</h1>
              <p className="text-sm text-[--color-text-muted]">Customize your store's brand colors</p>
            </div>
          </div>

          {hasChanges && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={handleCancel}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl border border-[--color-border] text-[--color-text-secondary] hover:bg-[--color-surface-hover] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveClick}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl text-white transition-all disabled:opacity-60"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>

        {/* Save Warning Modal */}
        {showSaveWarning && (
          <div className="p-4 rounded-xl border border-warning/20 bg-warning/5 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-text-primary">Low Contrast Warning</h3>
              <p className="text-sm text-text-muted mt-1">
                Your custom primary text color has a contrast ratio below the recommended AA level (4.5:1). This may make text difficult to read for some users.
              </p>
              <div className="flex gap-3 mt-3">
                <button
                  type="button"
                  onClick={() => setShowSaveWarning(false)}
                  className="text-sm font-medium text-text-secondary hover:text-text-primary"
                >
                  Edit Colors
                </button>
                <button
                  type="button"
                  onClick={performSave}
                  className="text-sm font-medium text-warning hover:text-warning-hover"
                >
                  Save Anyway
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Brand Colors */}
        <div className="rounded-2xl border border-[--color-border] p-6 space-y-8 bg-[--color-surface]">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-lg font-bold text-[--color-text-primary] flex items-center gap-2">
              <Palette className="w-4 h-4 text-[--color-text-muted]" />
              Brand Colors
            </h2>
            <button
              type="button"
              onClick={handleResetBrand}
              className="text-xs font-medium text-[--color-text-muted] hover:text-[--color-text-primary] flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="w-3 h-3" /> Reset Brand
            </button>
          </div>

          <ColorSection
            label="Primary Color"
            description="Used for buttons, links, active sidebar items, and key actions."
            presets={PRIMARY_PRESETS}
            selectedValue={localColors.primary}
            onPresetClick={(v) => handleColorChange('primary', v)}
            onCustomChange={(v) => handleColorChange('primary', v)}
          />
          <div className="border-t border-[--color-border]" />
          <ColorSection
            label="Secondary Color"
            description="Used for badges, hover highlights, and secondary actions."
            presets={SECONDARY_PRESETS}
            selectedValue={localColors.secondary}
            onPresetClick={(v) => handleColorChange('secondary', v)}
            onCustomChange={(v) => handleColorChange('secondary', v)}
          />
          <div className="border-t border-[--color-border]" />
          <ColorSection
            label="Background Color"
            description="The main page background behind surfaces."
            presets={BACKGROUND_PRESETS}
            selectedValue={localColors.background}
            onPresetClick={(v) => handleColorChange('background', v)}
            onCustomChange={(v) => handleColorChange('background', v)}
          />
        </div>

        {/* Typography Colors */}
        <div className="rounded-2xl border border-[--color-border] p-6 space-y-6 bg-[--color-surface]">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-[--color-text-primary] flex items-center gap-2">
              <Type className="w-4 h-4 text-[--color-text-muted]" />
              Typography
            </h2>
            <button
              type="button"
              onClick={handleResetTypography}
              className="text-xs font-medium text-[--color-text-muted] hover:text-[--color-text-primary] flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="w-3 h-3" /> Reset Typography
            </button>
          </div>

          <div className="flex p-1 bg-[--color-background] rounded-lg border border-[--color-border]">
            <button
              type="button"
              className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
                typographyMode === 'auto' ? 'bg-[--color-surface] shadow-sm text-[--color-text-primary]' : 'text-[--color-text-muted] hover:text-[--color-text-primary]'
              }`}
              onClick={() => handleModeChange('auto')}
            >
              Auto Mode
            </button>
            <button
              type="button"
              className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
                typographyMode === 'custom' ? 'bg-[--color-surface] shadow-sm text-[--color-text-primary]' : 'text-[--color-text-muted] hover:text-[--color-text-primary]'
              }`}
              onClick={() => handleModeChange('custom')}
            >
              Custom Mode
            </button>
          </div>

          {typographyMode === 'auto' ? (
            <div className="p-4 rounded-xl bg-[--color-background] border border-[--color-border] text-sm text-[--color-text-secondary]">
              <p>
                <strong>Auto Mode is active.</strong><br/>
                Text colors are automatically calculated for optimal legibility (WCAG AAA) against the current Background color.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <ColorSection
                label="Primary Text"
                description="Headings, key data, and product names."
                presets={TEXT_PRESETS}
                selectedValue={localColors.text.primary}
                onPresetClick={(v) => handleTextColorChange('primary', v)}
                onCustomChange={(v) => handleTextColorChange('primary', v)}
                contrastBg={localColors.background}
              />
              <ColorSection
                label="Secondary Text"
                description="Descriptions, table headers, and metadata."
                presets={TEXT_PRESETS}
                selectedValue={localColors.text.secondary}
                onPresetClick={(v) => handleTextColorChange('secondary', v)}
                onCustomChange={(v) => handleTextColorChange('secondary', v)}
                contrastBg={localColors.background}
              />
              <ColorSection
                label="Muted Text"
                description="Placeholders and secondary labels."
                presets={TEXT_PRESETS}
                selectedValue={localColors.text.muted}
                onPresetClick={(v) => handleTextColorChange('muted', v)}
                onCustomChange={(v) => handleTextColorChange('muted', v)}
                contrastBg={localColors.background}
              />
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Live Design System Preview */}
      <div className="xl:w-[450px] flex-shrink-0 relative">
        <div className="sticky top-6 rounded-2xl border border-[--color-border] bg-[--color-background] overflow-hidden shadow-card">
          <div className="px-4 py-3 bg-[--color-surface] border-b border-[--color-border] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Monitor className="w-4 h-4 text-[--color-text-muted]" />
              <span className="text-xs font-semibold text-[--color-text-primary] uppercase tracking-wider">Live Preview</span>
            </div>
          </div>
          
          <div className="p-4 space-y-4">
            
            {/* Nav Preview */}
            <div className="bg-[--color-surface] rounded-lg border border-[--color-border] shadow-sm flex overflow-hidden h-40">
              {/* Sidebar Mini */}
              <div className="w-16 border-r border-[--color-border] flex flex-col items-center py-4 gap-4">
                <div className="w-8 h-8 rounded bg-[--brand-primary]" />
                <div className="w-8 h-8 rounded-lg bg-[--brand-primary] opacity-20 relative">
                  <div className="absolute inset-0 bg-[--brand-primary] rounded-lg" style={{ opacity: 0.1 }}></div>
                  <Layout className="absolute inset-0 m-auto w-4 h-4 text-[--brand-primary]" />
                </div>
                <div className="w-8 h-8 rounded-lg hover:bg-[--color-surface-hover] flex items-center justify-center">
                  <User className="w-4 h-4 text-[--color-text-muted]" />
                </div>
              </div>
              {/* Main Area Mini */}
              <div className="flex-1 flex flex-col">
                <div className="h-10 border-b border-[--color-border] flex items-center justify-end px-3">
                  <Bell className="w-4 h-4 text-[--color-text-muted]" />
                </div>
                <div className="p-3">
                  <h3 className="text-sm font-bold text-[--color-text-primary]">Dashboard</h3>
                  <p className="text-[10px] text-[--color-text-secondary] mt-1">Welcome back, Admin</p>
                </div>
              </div>
            </div>

            {/* Table Preview */}
            <div className="bg-[--color-surface] rounded-lg border border-[--color-border] shadow-sm overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-[--color-surface-hover] border-b border-[--color-border]">
                  <tr>
                    <th className="px-3 py-2 text-[10px] font-medium text-[--color-text-muted] uppercase">Product</th>
                    <th className="px-3 py-2 text-[10px] font-medium text-[--color-text-muted] uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[--color-border]">
                  <tr>
                    <td className="px-3 py-2 text-xs font-semibold text-[--color-text-primary]">Premium Widget</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold bg-[--brand-secondary] text-white opacity-90">
                        In Stock
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-xs text-[--color-text-secondary]">Standard Widget</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold bg-[--color-surface-hover] text-[--color-text-muted]">
                        Draft
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Modal/Form Preview */}
            <div className="bg-[--color-surface] rounded-lg border border-[--color-border] shadow-xl overflow-hidden p-4 relative">
              <div className="absolute inset-0 bg-black/5" />
              <div className="relative bg-[--color-surface] border border-[--color-border] rounded-md p-3 shadow-md">
                <h4 className="text-sm font-bold text-[--color-text-primary] mb-1">Create Item</h4>
                <p className="text-xs text-[--color-text-secondary] mb-3">Add a new item to your store.</p>
                
                <div className="space-y-2 mb-4">
                  <label className="text-[10px] font-medium text-[--color-text-primary]">Item Name</label>
                  <div className="border border-[--color-border] rounded bg-[--color-background] px-2 py-1.5 text-xs text-[--color-text-muted]">
                    Enter name...
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button type="button" className="px-3 py-1.5 text-[10px] font-medium rounded text-[--color-text-secondary] border border-[--color-border]">
                    Cancel
                  </button>
                  <button type="button" className="px-3 py-1.5 text-[10px] font-medium rounded text-white bg-[--brand-primary]">
                    Save
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

    </div>
  );
}
