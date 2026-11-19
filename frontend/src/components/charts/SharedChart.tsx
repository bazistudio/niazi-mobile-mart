'use client';

import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { SharedChartConfig } from './types';
import { formatChartValue } from './formatters';

export const ChartLoadingState: React.FC<{ height?: number | string }> = ({ height = 260 }) => (
  <div
    style={{ height }}
    className="w-full flex flex-col items-center justify-center rounded-xl bg-gray-50/50 dark:bg-gray-800/20 border border-dashed border-gray-200 dark:border-gray-700 animate-pulse"
  >
    <div className="h-6 w-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin mb-2" />
    <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Loading visualization data...</span>
  </div>
);

export const ChartEmptyState: React.FC<{ message?: string; height?: number | string }> = ({
  message = 'No data available for display',
  height = 260,
}) => (
  <div
    style={{ height }}
    className="w-full flex flex-col items-center justify-center rounded-xl bg-gray-50/30 dark:bg-gray-800/10 border border-dashed border-gray-200 dark:border-gray-800 p-6 text-center"
  >
    <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">{message}</span>
  </div>
);

export const SharedChart: React.FC<SharedChartConfig> = ({
  variant,
  data,
  series,
  xAxis,
  yAxis,
  tooltip = { enabled: true },
  legend = { enabled: false },
  height = 280,
  minHeight = 200,
  maxWidth,
  align = 'left',
  barMaxSize,
  title,
  subtitle,
  emptyMessage,
  isLoading = false,
  currency = 'Rs',
  valueType = 'integer',
}) => {
  const wrapperStyle: React.CSSProperties = {
    ...(maxWidth !== undefined ? { maxWidth } : {}),
  };
  const wrapperAlignClass = align === 'center' && maxWidth !== undefined ? 'mx-auto' : '';

  if (isLoading) {
    return (
      <div className={`w-full min-w-0 ${wrapperAlignClass}`} style={wrapperStyle}>
        <ChartLoadingState height={height} />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className={`w-full min-w-0 ${wrapperAlignClass}`} style={wrapperStyle}>
        <ChartEmptyState message={emptyMessage} height={height} />
      </div>
    );
  }

  const defaultYAxisTickFormatter = (val: number) => formatChartValue(val, valueType, currency);

  const defaultTooltipFormatter = (value: any, name: any) => {
    const formatted = typeof value === 'number' ? formatChartValue(value, valueType, currency) : value;
    return [formatted, name];
  };

  const tooltipContentStyle: React.CSSProperties = {
    backgroundColor: 'rgba(15, 23, 42, 0.96)',
    border: '1px solid rgba(148, 163, 184, 0.25)',
    borderRadius: '0.625rem',
    fontSize: '0.75rem',
    color: '#f8fafc',
    boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.25)',
    padding: '8px 12px',
  };

  const truncateCategoryTick = (val: unknown) => {
    const str = String(val ?? '');
    return str.length > 18 ? `${str.slice(0, 17)}…` : str;
  };

  const renderChart = () => {
    switch (variant) {
      case 'bar':
      case 'stacked-bar': {
        return (
          <BarChart data={data} margin={{ top: 10, right: 12, left: -10, bottom: 2 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94a3b833" />
            <XAxis
              dataKey={xAxis?.dataKey ?? 'name'}
              hide={xAxis?.hide}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickFormatter={xAxis?.tickFormatter ?? truncateCategoryTick}
            />
            <YAxis
              hide={yAxis?.hide}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickFormatter={yAxis?.tickFormatter ?? defaultYAxisTickFormatter}
            />
            {tooltip.enabled && (
              <Tooltip
                formatter={tooltip.formatter as any ?? defaultTooltipFormatter}
                labelFormatter={tooltip.labelFormatter}
                contentStyle={tooltipContentStyle}
              />
            )}
            {legend.enabled && (
              <Legend
                verticalAlign={legend.position ?? 'bottom'}
                align={legend.align ?? 'center'}
                wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
              />
            )}
            {series.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={s.color}
                maxBarSize={barMaxSize ?? 36}
                stackId={variant === 'stacked-bar' ? (s.stackId ?? 'stack') : undefined}
                radius={variant === 'stacked-bar' ? [0, 0, 0, 0] : [5, 5, 0, 0]}
              />
            ))}
          </BarChart>
        );
      }

      case 'horizontal-bar': {
        return (
          <BarChart layout="vertical" data={data} margin={{ top: 8, right: 18, left: 6, bottom: 2 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#94a3b833" />
            <XAxis
              type="number"
              hide={xAxis?.hide}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickFormatter={xAxis?.tickFormatter ?? defaultYAxisTickFormatter}
            />
            <YAxis
              type="category"
              dataKey={yAxis?.dataKey ?? xAxis?.dataKey ?? 'name'}
              hide={yAxis?.hide}
              width={116}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickFormatter={yAxis?.tickFormatter ?? truncateCategoryTick}
            />
            {tooltip.enabled && (
              <Tooltip
                formatter={tooltip.formatter as any ?? defaultTooltipFormatter}
                labelFormatter={tooltip.labelFormatter}
                contentStyle={tooltipContentStyle}
              />
            )}
            {legend.enabled && (
              <Legend
                verticalAlign={legend.position ?? 'bottom'}
                align={legend.align ?? 'center'}
                wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
              />
            )}
            {series.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={s.color}
                maxBarSize={barMaxSize ?? 22}
                stackId={s.stackId}
                radius={[0, 4, 4, 0]}
              />
            ))}
          </BarChart>
        );
      }

      case 'line': {
        return (
          <LineChart data={data} margin={{ top: 10, right: 12, left: -10, bottom: 2 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94a3b833" />
            <XAxis
              dataKey={xAxis?.dataKey ?? 'name'}
              hide={xAxis?.hide}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickFormatter={xAxis?.tickFormatter ?? truncateCategoryTick}
            />
            <YAxis
              hide={yAxis?.hide}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickFormatter={yAxis?.tickFormatter ?? defaultYAxisTickFormatter}
            />
            {tooltip.enabled && (
              <Tooltip
                formatter={tooltip.formatter as any ?? defaultTooltipFormatter}
                labelFormatter={tooltip.labelFormatter}
                contentStyle={tooltipContentStyle}
              />
            )}
            {legend.enabled && (
              <Legend
                verticalAlign={legend.position ?? 'bottom'}
                align={legend.align ?? 'center'}
                wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
              />
            )}
            {series.map((s) => (
              <Line
                key={s.key}
                type={s.type ?? 'monotone'}
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={s.strokeWidth ?? 2}
                dot={{ r: 3, fill: s.color }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        );
      }

      case 'area': {
        return (
          <AreaChart data={data} margin={{ top: 10, right: 12, left: -10, bottom: 2 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94a3b833" />
            <XAxis
              dataKey={xAxis?.dataKey ?? 'name'}
              hide={xAxis?.hide}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickFormatter={xAxis?.tickFormatter ?? truncateCategoryTick}
            />
            <YAxis
              hide={yAxis?.hide}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickFormatter={yAxis?.tickFormatter ?? defaultYAxisTickFormatter}
            />
            {tooltip.enabled && (
              <Tooltip
                formatter={tooltip.formatter as any ?? defaultTooltipFormatter}
                labelFormatter={tooltip.labelFormatter}
                contentStyle={tooltipContentStyle}
              />
            )}
            {legend.enabled && (
              <Legend
                verticalAlign={legend.position ?? 'bottom'}
                align={legend.align ?? 'center'}
                wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
              />
            )}
            {series.map((s) => (
              <Area
                key={s.key}
                type={s.type ?? 'monotone'}
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                fill={s.color}
                fillOpacity={s.fillOpacity ?? 0.16}
                strokeWidth={s.strokeWidth ?? 2}
              />
            ))}
          </AreaChart>
        );
      }

      case 'pie':
      case 'donut': {
        const primarySeries = series[0];
        const dataKey = primarySeries?.key ?? 'value';
        return (
          <PieChart>
            {tooltip.enabled && (
              <Tooltip
                formatter={tooltip.formatter as any ?? defaultTooltipFormatter}
                contentStyle={tooltipContentStyle}
              />
            )}
            {legend.enabled && (
              <Legend
                verticalAlign={legend.position ?? 'bottom'}
                align={legend.align ?? 'center'}
                wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
              />
            )}
            <Pie
              data={data}
              dataKey={dataKey}
              nameKey={xAxis?.dataKey ?? 'name'}
              cx="50%"
              cy="48%"
              innerRadius={variant === 'donut' ? '56%' : 0}
              outerRadius="78%"
              paddingAngle={variant === 'donut' ? 3 : 0}
            >
              {data.map((entry: any, index: number) => {
                const color = entry.color ?? series[index % series.length]?.color ?? '#006970';
                return <Cell key={`cell-${index}`} fill={color} />;
              })}
            </Pie>
          </PieChart>
        );
      }

      case 'composed': {
        return (
          <ComposedChart data={data} margin={{ top: 10, right: 12, left: -10, bottom: 2 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94a3b833" />
            <XAxis
              dataKey={xAxis?.dataKey ?? 'name'}
              hide={xAxis?.hide}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickFormatter={xAxis?.tickFormatter ?? truncateCategoryTick}
            />
            <YAxis
              hide={yAxis?.hide}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickFormatter={yAxis?.tickFormatter ?? defaultYAxisTickFormatter}
            />
            {tooltip.enabled && (
              <Tooltip
                formatter={tooltip.formatter as any ?? defaultTooltipFormatter}
                labelFormatter={tooltip.labelFormatter}
                contentStyle={tooltipContentStyle}
              />
            )}
            {legend.enabled && (
              <Legend
                verticalAlign={legend.position ?? 'bottom'}
                align={legend.align ?? 'center'}
                wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
              />
            )}
            {series.map((s) => {
              const rType = s.renderType ?? 'bar';
              if (rType === 'line') {
                return (
                  <Line
                    key={s.key}
                    type={s.type ?? 'monotone'}
                    dataKey={s.key}
                    name={s.label}
                    stroke={s.color}
                    strokeWidth={s.strokeWidth ?? 2}
                    dot={{ r: 3, fill: s.color }}
                    activeDot={{ r: 5 }}
                  />
                );
              }
              if (rType === 'area') {
                return (
                  <Area
                    key={s.key}
                    type={s.type ?? 'monotone'}
                    dataKey={s.key}
                    name={s.label}
                    stroke={s.color}
                    fill={s.color}
                    fillOpacity={s.fillOpacity ?? 0.16}
                    strokeWidth={s.strokeWidth ?? 2}
                  />
                );
              }
              return (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  fill={s.color}
                  maxBarSize={barMaxSize ?? 32}
                  stackId={s.stackId}
                  radius={[5, 5, 0, 0]}
                />
              );
            })}
          </ComposedChart>
        );
      }

      default:
        return <ChartEmptyState message={`Unsupported chart variant: ${variant}`} height={height} />;
    }
  };

  return (
    <div className={`w-full min-w-0 flex flex-col ${wrapperAlignClass}`} style={wrapperStyle}>
      {(title || subtitle) && (
        <div className="mb-3">
          {title && <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h4>}
          {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
        </div>
      )}
      <div className="w-full min-w-0" style={{ height, minHeight }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          {renderChart()}
        </ResponsiveContainer>
      </div>
    </div>
  );
};
