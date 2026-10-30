import React, { useState, useEffect } from 'react';
import {
  ArrowRightLeft,
  Search,
  Building2,
  Smartphone,
  Plus,
  AlertCircle,
  Clock,
  CheckCircle2,
  Send,
  Boxes,
  Info,
} from 'lucide-react';
import { Card, Badge, Button } from '@/components/ui';
import { httpClient } from '@/lib/http/httpClient';
import type { MobileInventoryItem } from '../types/mobile.types';

interface BranchOption {
  _id?: string;
  id?: string;
  name: string;
  code?: string;
}

interface StockTransferTabProps {
  currentBranchId?: string;
  availableDevices: MobileInventoryItem[];
}

export const StockTransferTab: React.FC<StockTransferTabProps> = ({
  currentBranchId,
  availableDevices,
}) => {
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [destBranchId, setDestBranchId] = useState<string>('');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [transferNotes, setTransferNotes] = useState<string>('');
  const [searchFilter, setSearchFilter] = useState('');

  // Fetch registered retail branches for destination selection
  useEffect(() => {
    let isMounted = true;
    const fetchBranches = async () => {
      setIsLoadingBranches(true);
      try {
        const res = await httpClient.get<BranchOption[] | { data: BranchOption[] }>('/api/v1/branches');
        const list: BranchOption[] = Array.isArray(res) ? res : (res?.data || []);
        if (isMounted) {
          setBranches(list);
          const otherBranch = list.find((b: BranchOption) => (b.id || b._id) !== currentBranchId);
          if (otherBranch) {
            setDestBranchId(otherBranch.id || otherBranch._id || '');
          }
        }
      } catch {
        // Fallback default list if permission or offline
        if (isMounted) {
          setBranches([]);
        }
      } finally {
        if (isMounted) setIsLoadingBranches(false);
      }
    };
    fetchBranches();
    return () => {
      isMounted = false;
    };
  }, [currentBranchId]);

  const selectedDevice = availableDevices.find((d) => d.id === selectedDeviceId);

  return (
    <div className="flex flex-col gap-6">
      {/* Informational Header Alert */}
      <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-start gap-3 text-text-primary">
        <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold text-text-primary">
            Branch Stock Transfer — Architecture & Workflow Preview
          </p>
          <p className="text-text-muted mt-0.5 leading-relaxed">
            Move serialized mobile handsets between authorized retail branches. In future backend phases, initiating a transfer
            will record outbox movements, update device branch attribution, and require receiving confirmation at the destination counter.
          </p>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card variant="default" padding="sm" className="bg-surface border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Total Transfers</p>
              <p className="text-2xl font-bold text-text-primary mt-1">0</p>
              <p className="text-[11px] text-text-muted mt-0.5">All recorded movements</p>
            </div>
            <div className="p-2.5 bg-primary/10 rounded-lg text-primary">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card variant="default" padding="sm" className="bg-surface border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Pending Dispatch</p>
              <p className="text-2xl font-bold text-warning mt-1">0</p>
              <p className="text-[11px] text-text-muted mt-0.5">Awaiting handover</p>
            </div>
            <div className="p-2.5 bg-warning/10 rounded-lg text-warning">
              <Clock className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card variant="default" padding="sm" className="bg-surface border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">In Transit</p>
              <p className="text-2xl font-bold text-accent mt-1">0</p>
              <p className="text-[11px] text-text-muted mt-0.5">Between branches</p>
            </div>
            <div className="p-2.5 bg-accent/10 rounded-lg text-accent">
              <Send className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card variant="default" padding="sm" className="bg-surface border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Completed</p>
              <p className="text-2xl font-bold text-success mt-1">0</p>
              <p className="text-[11px] text-text-muted mt-0.5">Received & verified</p>
            </div>
            <div className="p-2.5 bg-success/10 rounded-lg text-success">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
        </Card>
      </div>

      {/* Main Grid: Form Panel (Left) & Transfer History (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: New Transfer Dispatch Form */}
        <Card variant="default" padding="md" className="bg-surface border-border flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-primary" />
              Initiate Mobile Transfer
            </h3>
            <Badge variant="neutral" size="sm">Preview Mode</Badge>
          </div>

          {/* Source Branch */}
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1">
              Source Origin (Current Branch)
            </label>
            <div className="px-3 py-2 bg-surface-hover/70 border border-border rounded-lg text-sm text-text-primary font-medium flex items-center gap-2">
              <Building2 className="w-4 h-4 text-text-muted" />
              <span>Current Assigned Branch</span>
            </div>
          </div>

          {/* Destination Branch */}
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1">
              Destination Target Branch
            </label>
            <select
              value={destBranchId}
              onChange={(e) => setDestBranchId(e.target.value)}
              disabled={isLoadingBranches || branches.length <= 1}
              className="w-full px-3 py-2 bg-surface text-text-primary border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
            >
              {isLoadingBranches ? (
                <option value="">Loading branches...</option>
              ) : branches.length === 0 ? (
                <option value="">No other branches found</option>
              ) : (
                branches
                  .filter((b: BranchOption) => (b.id || b._id) !== currentBranchId)
                  .map((b: BranchOption) => (
                    <option key={b.id || b._id} value={b.id || b._id}>
                      {b.name} {b.code ? `(${b.code})` : ''}
                    </option>
                  ))
              )}
            </select>
          </div>

          {/* Handset / IMEI Selector */}
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1">
              Select Handset from In-Stock Shelf
            </label>
            <select
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              className="w-full px-3 py-2 bg-surface text-text-primary border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
            >
              <option value="">-- Choose Mobile Device --</option>
              {availableDevices.map((dev) => (
                <option key={dev.id} value={dev.id}>
                  {dev.brand} {dev.model} • IMEI: {dev.imei1} ({dev.condition})
                </option>
              ))}
            </select>
          </div>

          {/* Selected Device Preview Card */}
          {selectedDevice && (
            <div className="p-3 bg-surface-hover/50 border border-border rounded-lg text-xs flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-text-primary">{selectedDevice.brand} {selectedDevice.model}</span>
                <Badge variant={selectedDevice.condition === 'NEW' ? 'success' : 'warning'} size="sm">
                  {selectedDevice.condition}
                </Badge>
              </div>
              <div className="text-text-muted">
                Storage: {selectedDevice.storage} | RAM: {selectedDevice.ram} | Color: {selectedDevice.color}
              </div>
              <div className="font-mono text-text-secondary">
                IMEI: {selectedDevice.imei1}
              </div>
            </div>
          )}

          {/* Transfer Notes */}
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1">
              Transfer Notes / Courier Tracking
            </label>
            <textarea
              rows={2}
              value={transferNotes}
              onChange={(e) => setTransferNotes(e.target.value)}
              placeholder="e.g. Dispatched with rider / stock balancing..."
              className="w-full px-3 py-2 bg-surface text-text-primary border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-text-muted resize-none"
            />
          </div>

          {/* Action Button (Permanently disabled / guarded in this phase) */}
          <div className="pt-2">
            <Button
              variant="primary"
              size="md"
              disabled={true}
              className="w-full justify-center opacity-60 cursor-not-allowed"
              title="Stock transfer mutation API will be connected in a future backend release"
            >
              <ArrowRightLeft className="w-4 h-4 mr-2" />
              Transfer Handset (Coming Soon)
            </Button>
            <p className="text-[11px] text-text-muted text-center mt-2">
              Action disabled during Phase 1 UI preview. No database write will occur.
            </p>
          </div>
        </Card>

        {/* Right Column: Transfer Movement History Table */}
        <Card variant="default" padding="none" className="bg-surface border-border lg:col-span-2 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
                <Boxes className="w-4 h-4 text-primary" />
                Transfer Movements History
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                Audit trail of dispatched and received mobile inventory shipments
              </p>
            </div>
            <div className="relative min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search transfer ref, IMEI..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-surface text-text-primary placeholder:text-text-muted border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Table Area (Empty State) */}
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-surface-hover flex items-center justify-center text-text-muted mb-3">
              <ArrowRightLeft className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-semibold text-text-primary mb-1">
              No Transfer Movements Recorded
            </h4>
            <p className="text-xs text-text-muted max-w-sm leading-relaxed mb-4">
              When inter-branch shipments are dispatched, each batch reference, source origin, destination branch, and serial tracking status will appear in this ledger.
            </p>
            <Badge variant="neutral" size="sm">
              Status: Ready for Backend Integration
            </Badge>
          </div>
        </Card>
      </div>
    </div>
  );
};
