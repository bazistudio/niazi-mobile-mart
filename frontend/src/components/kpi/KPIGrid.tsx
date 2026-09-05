'use client';

import React from 'react';
import { KPICard } from './KPICard';
import { KPIData } from '../../types/dashboard/kpi.types';

interface KPIGridProps {
  data: KPIData[];
  isLoading?: boolean;
}

export const KPIGrid = ({ data, isLoading = false }: KPIGridProps) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-6 w-full">
      {isLoading
        ? Array.from({ length: 5 }).map((_, index) => (
            <KPICard key={`skeleton-${index}`} data={{} as any} isLoading={true} />
          ))
        : data.map((item, index) => (
            <KPICard key={`kpi-${index}`} data={item} />
          ))}
    </div>
  );
};

export default KPIGrid;
