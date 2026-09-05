/**
 * Converts a hex color string to an RGB array.
 * @param hex string (e.g. '#111827' or '#FFF')
 * @returns [r, g, b] array
 */
function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) {
    h = h.split('').map(c => c + c).join('');
  }
  const num = parseInt(h, 16);
  return [num >> 16, (num >> 8) & 255, num & 255];
}

/**
 * Calculates the relative luminance of a color according to WCAG standards.
 * @param hex string
 * @returns number between 0 and 1
 */
export function getLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

/**
 * Calculates the contrast ratio between two colors according to WCAG standards.
 * @param color1 string (hex)
 * @param color2 string (hex)
 * @returns contrast ratio (e.g., 4.5)
 */
export function getContrastRatio(color1: string, color2: string): number {
  const lum1 = getLuminance(color1);
  const lum2 = getLuminance(color2);
  const lightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (lightest + 0.05) / (darkest + 0.05);
}

/**
 * Checks if a contrast ratio meets WCAG accessibility standards.
 * @param ratio number
 * @returns object indicating if it passes AA and AAA standards for normal text
 */
export function isAccessible(ratio: number): { isAA: boolean; isAAA: boolean; indicator: 'AAA' | 'AA' | 'Fail' } {
  if (ratio >= 7) return { isAA: true, isAAA: true, indicator: 'AAA' };
  if (ratio >= 4.5) return { isAA: true, isAAA: false, indicator: 'AA' };
  return { isAA: false, isAAA: false, indicator: 'Fail' };
}

/**
 * Generates a complete semantic text palette based on the given background color.
 * Uses a dark palette for light backgrounds, and a light palette for dark backgrounds.
 * @param bgColor string (hex)
 * @returns { primary, secondary, muted, disabled }
 */
export function generateAutoTextColors(bgColor: string) {
  const bgLuminance = getLuminance(bgColor);
  
  // If the background is light, use dark text. If background is dark, use light text.
  if (bgLuminance > 0.179) { // Standard threshold
    return {
      primary: '#111827',   // Gray-900
      secondary: '#4b5563', // Gray-600
      muted: '#6b7280',     // Gray-500
      disabled: '#9ca3af'   // Gray-400
    };
  } else {
    return {
      primary: '#f9fafb',   // Gray-50
      secondary: '#d1d5db', // Gray-300
      muted: '#9ca3af',     // Gray-400
      disabled: '#6b7280'   // Gray-500
    };
  }
}
