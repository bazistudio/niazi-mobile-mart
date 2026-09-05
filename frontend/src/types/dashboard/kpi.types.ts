import { ReactNode } from 'react';

export interface KPIData {
  title: string;
  value: string | number;
  trend: number; // percentage change, positive or negative
  icon: ReactNode;
  format?: 'currency' | 'number' | 'percentage';
  timeframe?: string;
  onClick?: () => void;
}
