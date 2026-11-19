import React from 'react';

export type ChartVariant =
  | 'bar'
  | 'horizontal-bar'
  | 'line'
  | 'area'
  | 'pie'
  | 'donut'
  | 'stacked-bar'
  | 'composed';

export type ValueFormatter = (value: number) => string;

export interface ChartSeriesConfig {
  key: string;
  label: string;
  color: string;
  renderType?: 'bar' | 'line' | 'area';
  fillOpacity?: number;
  strokeWidth?: number;
  stackId?: string;
  type?: 'monotone' | 'linear' | 'step';
  yAxisId?: string;
}

export interface ChartAxisConfig {
  dataKey?: string;
  label?: string;
  tickFormatter?: (value: any) => string;
  hide?: boolean;
}

export interface ChartTooltipConfig {
  enabled?: boolean;
  formatter?: (value: number, name: string, item: any, index: number) => [string, string] | React.ReactNode;
  labelFormatter?: (label: any) => React.ReactNode;
}

export interface ChartLegendConfig {
  enabled?: boolean;
  position?: 'top' | 'bottom';
  align?: 'left' | 'center' | 'right';
}

export interface SharedChartConfig<T = any> {
  variant: ChartVariant;
  data: T[];
  series: ChartSeriesConfig[];
  xAxis?: ChartAxisConfig;
  yAxis?: ChartAxisConfig;
  tooltip?: ChartTooltipConfig;
  legend?: ChartLegendConfig;
  height?: number | string;
  minHeight?: number;
  maxWidth?: number | string;
  align?: 'left' | 'center';
  barMaxSize?: number;
  title?: string;
  subtitle?: string;
  emptyMessage?: string;
  isLoading?: boolean;
  currency?: string;
  valueType?: 'currency' | 'integer' | 'decimal' | 'percentage' | 'compact';
}
