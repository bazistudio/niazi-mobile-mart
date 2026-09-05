'use client';

import React from 'react';
import { Search, Filter, Download, RefreshCw, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export interface TableToolbarProps {
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  searchPlaceholder?: string;
  onFilterClick?: () => void;
  onExportClick?: () => void;
  onRefreshClick?: () => void;
  hasBulkActions?: boolean;
  onBulkActionClick?: () => void;
  children?: React.ReactNode;
}

export function TableToolbar({
  searchQuery = '',
  onSearchChange,
  searchPlaceholder = 'Search...',
  onFilterClick,
  onExportClick,
  onRefreshClick,
  hasBulkActions = false,
  onBulkActionClick,
  children,
}: TableToolbarProps) {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
      <div className="flex flex-1 items-center gap-2 w-full sm:w-auto max-w-md relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-4 w-4 text-text-muted" />
        </div>
        <input
          type="text"
          className="block w-full pl-10 pr-3 py-2 border border-border rounded-md leading-5 bg-surface placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm transition-colors"
          placeholder={searchPlaceholder}
          value={searchQuery}
          onChange={(e) => onSearchChange?.(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0 hide-scrollbar">
        {onFilterClick && (
          <Button variant="outline" size="sm" onClick={onFilterClick} className="whitespace-nowrap">
            <Filter className="h-4 w-4 mr-2" />
            Filters
          </Button>
        )}
        
        {hasBulkActions && onBulkActionClick && (
          <Button variant="outline" size="sm" onClick={onBulkActionClick} className="whitespace-nowrap">
            <MoreHorizontal className="h-4 w-4 mr-2" />
            Bulk Actions
          </Button>
        )}

        {children}

        {onExportClick && (
          <Button variant="outline" size="sm" onClick={onExportClick} title="Export">
            <Download className="h-4 w-4" />
          </Button>
        )}
        
        {onRefreshClick && (
          <Button variant="outline" size="sm" onClick={onRefreshClick} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
