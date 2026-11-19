export function formatChartValue(
  value: number,
  type: 'currency' | 'integer' | 'decimal' | 'percentage' | 'compact' = 'integer',
  currency: string = 'Rs'
): string {
  if (value === undefined || value === null || isNaN(value)) return '0';

  switch (type) {
    case 'currency':
      return `${currency} ${Math.round(value).toLocaleString()}`;
    case 'percentage':
      return `${value.toFixed(1)}%`;
    case 'decimal':
      return value.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 });
    case 'compact': {
      if (Math.abs(value) >= 1_000_000) {
        return `${(value / 1_000_000).toFixed(1)}M`;
      }
      if (Math.abs(value) >= 1_000) {
        return `${(value / 1_000).toFixed(1)}k`;
      }
      return value.toLocaleString();
    }
    case 'integer':
    default:
      return Math.round(value).toLocaleString();
  }
}
