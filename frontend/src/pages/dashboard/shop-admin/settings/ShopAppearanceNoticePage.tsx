import React from 'react';
import { Link } from 'react-router-dom';
import { Palette, ArrowRight } from 'lucide-react';

export const ShopAppearanceNoticePage: React.FC = () => {
  return (
    <div className="bg-surface border border-border rounded-xl p-8 text-center max-w-2xl mx-auto my-8 shadow-sm">
      <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
        <Palette className="w-6 h-6" />
      </div>
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20 mb-3">
        <span>Application Global Configuration</span>
      </div>
      <h2 className="text-lg font-bold text-text-primary mb-2">Application Appearance & Theme</h2>
      <p className="text-sm text-text-muted mb-6 leading-relaxed">
        Visual themes, color presets, and display modes are configured centrally at the Organization level and automatically applied across all branch terminals.
      </p>
      <Link
        to="/dashboard/organization/settings?tab=appearance"
        className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90 transition-colors shadow-sm"
      >
        <span>Open Organization Appearance Settings</span>
        <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
};
