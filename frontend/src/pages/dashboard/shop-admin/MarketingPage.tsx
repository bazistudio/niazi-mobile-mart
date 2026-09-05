import React from 'react';
import { MarketingWorkspace } from '@/features/marketing/components/MarketingWorkspace';

export const MarketingPage: React.FC = () => {
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto h-full">
      <MarketingWorkspace />
    </div>
  );
};
