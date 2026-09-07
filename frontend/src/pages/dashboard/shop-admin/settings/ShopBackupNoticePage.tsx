import React from 'react';
import { Link } from 'react-router-dom';
import { Database, ArrowRight, ShieldAlert } from 'lucide-react';

export const ShopBackupNoticePage: React.FC = () => {
  return (
    <div className="bg-surface border border-border rounded-xl p-8 text-center max-w-2xl mx-auto my-8 shadow-sm">
      <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
        <Database className="w-6 h-6" />
      </div>
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 mb-3">
        <ShieldAlert className="w-3.5 h-3.5" />
        <span>Enterprise Scope Control</span>
      </div>
      <h2 className="text-lg font-bold text-text-primary mb-2">Database Backup & Restore</h2>
      <p className="text-sm text-text-muted mb-6 leading-relaxed">
        Database snapshots and recovery operations affect the complete SQLite database across all branches. For system stability and data protection, backup and recovery operations are administered exclusively from the Organization Admin dashboard.
      </p>
      <Link
        to="/dashboard/organization/settings?tab=backup"
        className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90 transition-colors shadow-sm"
      >
        <span>Open Organization Backup & Restore</span>
        <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
};
