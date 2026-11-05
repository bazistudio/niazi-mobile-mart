import React, { useState, useEffect, useMemo } from 'react';
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
  Trash2,
  Loader2,
  Check,
} from 'lucide-react';
import { Card, Badge, Button } from '@/components/ui';
import { httpClient } from '@/lib/http/httpClient';
import { mobileApi } from '../services/mobile.api';
import type { MobileInventoryItem } from '../types/mobile.types';
import toast from 'react-hot-toast';

interface BranchOption {
  _id?: string;
  id?: string;
  name: string;
  code?: string;
}

interface TransferMovementItem {
  id: string;
  device_id: string;
  movement_type: string;
  from_branch_id: string | null;
  to_branch_id: string | null;
  from_branch_name?: string;
  to_branch_name?: string;
  brand?: string;
  model?: string;
  imei1?: string;
  performed_by_name?: string;
  notes: string | null;
  created_at: string;
}

interface StockTransferTabProps {
  currentBranchId?: string;
  availableDevices: MobileInventoryItem[];
  onTransferCompleted?: () => void;
}

export const StockTransferTab: React.FC<StockTransferTabProps> = ({
  currentBranchId,
  availableDevices,
  onTransferCompleted,
}) => {
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [destBranchId, setDestBranchId] = useState<string>('');
  const [transferNotes, setTransferNotes] = useState<string>('');

  // Inline Search & Staging List State
  const [handsetSearchQuery, setHandsetSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [stagedDevices, setStagedDevices] = useState<MobileInventoryItem[]>([]);
  const [isDispatching, setIsDispatching] = useState(false);

  // Movements Audit History State
  const [movements, setMovements] = useState<TransferMovementItem[]>([]);
  const [isLoadingMovements, setIsLoadingMovements] = useState(false);
  const [historySearchFilter, setHistorySearchFilter] = useState('');

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

  // Fetch Movements History
  const fetchMovements = async () => {
    setIsLoadingMovements(true);
    try {
      const res = await mobileApi.getMobileTransfers({
        branch_id: currentBranchId,
        limit: 50,
      });
      setMovements(res.movements || []);
    } catch (err) {
      console.warn('Failed to fetch mobile transfer movements:', err);
    } finally {
      setIsLoadingMovements(false);
    }
  };

  useEffect(() => {
    void fetchMovements();
  }, [currentBranchId]);

  // Filter available devices for the search selector (must be IN_STOCK and not already staged)
  const stagedIds = useMemo(() => new Set(stagedDevices.map((d) => d.id)), [stagedDevices]);

  const searchResults = useMemo(() => {
    const q = handsetSearchQuery.trim().toLowerCase();
    if (!q) {
      return availableDevices.filter((d) => !stagedIds.has(d.id)).slice(0, 8);
    }
    return availableDevices.filter((d) => {
      if (stagedIds.has(d.id)) return false;
      const matchBrand = d.brand.toLowerCase().includes(q);
      const matchModel = d.model.toLowerCase().includes(q);
      const matchImei1 = d.imei1.toLowerCase().includes(q);
      const matchColor = d.color ? d.color.toLowerCase().includes(q) : false;
      const matchStorage = d.storage ? d.storage.toLowerCase().includes(q) : false;
      const matchRam = d.ram ? d.ram.toLowerCase().includes(q) : false;
      return matchBrand || matchModel || matchImei1 || matchColor || matchStorage || matchRam;
    });
  }, [availableDevices, stagedIds, handsetSearchQuery]);

  const handleStageDevice = (device: MobileInventoryItem) => {
    if (stagedIds.has(device.id)) {
      toast.error('Device is already in the transfer staging list');
      return;
    }
    setStagedDevices((prev) => [...prev, device]);
    setHandsetSearchQuery('');
    setIsSearchOpen(false);
  };

  const handleRemoveStaged = (deviceId: string) => {
    setStagedDevices((prev) => prev.filter((d) => d.id !== deviceId));
  };

  const handleExecuteTransfer = async () => {
    if (!currentBranchId) {
      toast.error('Source branch is missing. Please select an active branch.');
      return;
    }
    if (!destBranchId) {
      toast.error('Please choose a destination branch for this transfer.');
      return;
    }
    if (currentBranchId === destBranchId) {
      toast.error('Source and destination branches cannot be the same.');
      return;
    }
    if (stagedDevices.length === 0) {
      toast.error('Please add at least one handset to the transfer list.');
      return;
    }

    setIsDispatching(true);
    let successCount = 0;
    const failedList: Array<{ device: MobileInventoryItem; error: string }> = [];

    for (const dev of stagedDevices) {
      try {
        await mobileApi.transferMobile(dev.id, {
          source_branch_id: currentBranchId,
          destination_branch_id: destBranchId,
          notes: transferNotes.trim() || undefined,
        });
        successCount++;
      } catch (err: any) {
        const msg = err?.response?.data?.message || err?.response?.data?.error || err?.message || 'Transfer failed';
        failedList.push({ device: dev, error: msg });
      }
    }

    setIsDispatching(false);

    if (successCount > 0) {
      const destName = branches.find((b) => (b.id || b._id) === destBranchId)?.name || 'destination';
      toast.success(`Successfully dispatched ${successCount} handset(s) to ${destName}!`);
      // Retain failed devices in stage, remove successful ones
      if (failedList.length === 0) {
        setStagedDevices([]);
        setTransferNotes('');
      } else {
        const failedIds = new Set(failedList.map((f) => f.device.id));
        setStagedDevices((prev) => prev.filter((d) => failedIds.has(d.id)));
        toast.error(`${failedList.length} device(s) failed to transfer. Please review errors.`);
      }
      // Refresh inventory and movements list
      void fetchMovements();
      if (onTransferCompleted) {
        onTransferCompleted();
      }
    } else if (failedList.length > 0) {
      toast.error(`Transfer failed: ${failedList[0].error}`);
    }
  };

  // Filter history movements by search text
  const filteredMovements = useMemo(() => {
    const q = historySearchFilter.trim().toLowerCase();
    if (!q) return movements;
    return movements.filter((m) => {
      const matchBrand = m.brand ? m.brand.toLowerCase().includes(q) : false;
      const matchModel = m.model ? m.model.toLowerCase().includes(q) : false;
      const matchImei = m.imei1 ? m.imei1.toLowerCase().includes(q) : false;
      const matchFrom = m.from_branch_name ? m.from_branch_name.toLowerCase().includes(q) : false;
      const matchTo = m.to_branch_name ? m.to_branch_name.toLowerCase().includes(q) : false;
      const matchNotes = m.notes ? m.notes.toLowerCase().includes(q) : false;
      return matchBrand || matchModel || matchImei || matchFrom || matchTo || matchNotes;
    });
  }, [movements, historySearchFilter]);

  return (
    <div className="flex flex-col gap-6">
      {/* Informational Header Alert */}
      <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-start gap-3 text-text-primary">
        <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold text-text-primary">
            Branch Stock Transfer — Serialized Handset Movement
          </p>
          <p className="text-text-muted mt-0.5 leading-relaxed">
            Transfer serialized mobile handsets between authorized retail branches with complete audit tracking and immutable IMEI history.
          </p>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card variant="default" padding="sm" className="bg-surface border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Total Transfers</p>
              <p className="text-2xl font-bold text-text-primary mt-1">{movements.length}</p>
              <p className="text-[11px] text-text-muted mt-0.5">Recorded movements</p>
            </div>
            <div className="p-2.5 bg-primary/10 rounded-lg text-primary">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card variant="default" padding="sm" className="bg-surface border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">In Staging Queue</p>
              <p className="text-2xl font-bold text-warning mt-1">{stagedDevices.length}</p>
              <p className="text-[11px] text-text-muted mt-0.5">Ready for dispatch</p>
            </div>
            <div className="p-2.5 bg-warning/10 rounded-lg text-warning">
              <Clock className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card variant="default" padding="sm" className="bg-surface border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Available Shelf</p>
              <p className="text-2xl font-bold text-accent mt-1">{availableDevices.length}</p>
              <p className="text-[11px] text-text-muted mt-0.5">In-stock at branch</p>
            </div>
            <div className="p-2.5 bg-accent/10 rounded-lg text-accent">
              <Smartphone className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card variant="default" padding="sm" className="bg-surface border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Transfer Target</p>
              <p className="text-sm font-bold text-success mt-2 truncate">
                {branches.find((b) => (b.id || b._id) === destBranchId)?.name || 'None Selected'}
              </p>
              <p className="text-[11px] text-text-muted mt-0.5">Destination counter</p>
            </div>
            <div className="p-2.5 bg-success/10 rounded-lg text-success">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
        </Card>
      </div>

      {/* Main Two-Column Workflow Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Transfer Initiation Form */}
        <Card variant="default" padding="md" className="bg-surface border-border flex flex-col gap-4">
          <div className="border-b border-border pb-3">
            <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
              <Send className="w-4 h-4 text-primary" />
              Initiate Handset Transfer
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              Select destination branch and handsets to dispatch
            </p>
          </div>

          {/* Source Branch (Fixed / Current Branch) */}
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1">
              Source Origin (Current Branch)
            </label>
            <div className="px-3 py-2 bg-surface-hover/70 border border-border rounded-lg text-sm font-medium text-text-primary flex items-center gap-2">
              <Building2 className="w-4 h-4 text-text-muted" />
              <span>
                {branches.find((b) => (b.id || b._id) === currentBranchId)?.name || 'Current Branch'}
              </span>
            </div>
          </div>

          {/* Destination Branch Selector */}
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1">
              Destination Branch <span className="text-red-500">*</span>
            </label>
            <select
              value={destBranchId}
              onChange={(e) => setDestBranchId(e.target.value)}
              className="w-full px-3 py-2 bg-surface text-text-primary border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
            >
              <option value="">-- Select Destination Branch --</option>
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

          {/* Inline Searchable Handset Selector */}
          <div className="relative">
            <label className="block text-xs font-semibold text-text-secondary mb-1">
              Select Handset from In-Stock Shelf <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={handsetSearchQuery}
                onFocus={() => setIsSearchOpen(true)}
                onChange={(e) => {
                  setHandsetSearchQuery(e.target.value);
                  setIsSearchOpen(true);
                }}
                placeholder="Search by IMEI, model, brand, color..."
                className="w-full pl-8 pr-3 py-2 bg-surface text-text-primary border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-text-muted"
              />
            </div>

            {/* Dropdown Results Combobox */}
            {isSearchOpen && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-surface border border-border rounded-lg shadow-xl max-h-60 overflow-y-auto z-50 divide-y divide-border/60">
                {searchResults.length === 0 ? (
                  <div className="p-3 text-xs text-text-muted text-center">
                    No available matching handsets found in branch stock
                  </div>
                ) : (
                  searchResults.map((dev) => (
                    <div
                      key={dev.id}
                      onClick={() => handleStageDevice(dev)}
                      className="p-2.5 hover:bg-surface-hover/80 cursor-pointer transition-colors flex items-center justify-between text-xs"
                    >
                      <div className="flex flex-col gap-0.5">
                        <div className="font-semibold text-text-primary flex items-center gap-1.5">
                          <span>{dev.brand} {dev.model}</span>
                          <Badge variant={dev.condition === 'NEW' ? 'success' : 'warning'} size="sm">
                            {dev.condition}
                          </Badge>
                        </div>
                        <div className="text-text-muted text-[11px]">
                          IMEI: <span className="font-mono text-text-secondary">{dev.imei1}</span>
                          {dev.storage ? ` | ${dev.storage}` : ''}
                          {dev.color ? ` | ${dev.color}` : ''}
                        </div>
                      </div>
                      <Plus className="w-4 h-4 text-primary shrink-0" />
                    </div>
                  ))
                )}
                <div
                  onClick={() => setIsSearchOpen(false)}
                  className="p-1.5 text-[10px] text-center text-text-muted hover:text-text-primary cursor-pointer bg-surface-hover/30"
                >
                  Close Dropdown
                </div>
              </div>
            )}
          </div>

          {/* Staged Handsets Transfer Queue */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-text-secondary">
                Staged Handsets to Transfer ({stagedDevices.length})
              </label>
              {stagedDevices.length > 0 && (
                <button
                  type="button"
                  onClick={() => setStagedDevices([])}
                  className="text-[11px] text-red-500 hover:text-red-600 transition-colors"
                >
                  Clear All
                </button>
              )}
            </div>

            {stagedDevices.length === 0 ? (
              <div className="p-4 border border-dashed border-border rounded-lg text-center text-xs text-text-muted">
                No handsets selected yet. Search above to add handsets to the transfer list.
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
                {stagedDevices.map((dev) => (
                  <div
                    key={dev.id}
                    className="p-2 bg-surface-hover/60 border border-border rounded-lg text-xs flex items-center justify-between"
                  >
                    <div className="flex flex-col">
                      <span className="font-semibold text-text-primary">{dev.brand} {dev.model}</span>
                      <span className="text-[11px] text-text-muted font-mono">IMEI: {dev.imei1}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveStaged(dev.id)}
                      className="p-1 text-text-muted hover:text-red-500 rounded transition-colors"
                      title="Remove handset"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

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

          {/* Action Dispatch Button */}
          <div className="pt-2">
            <Button
              variant="primary"
              size="md"
              disabled={isDispatching || stagedDevices.length === 0 || !destBranchId}
              onClick={handleExecuteTransfer}
              className="w-full justify-center"
            >
              {isDispatching ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Dispatching Handsets...
                </>
              ) : (
                <>
                  <ArrowRightLeft className="w-4 h-4 mr-2" />
                  Dispatch Transfer ({stagedDevices.length})
                </>
              )}
            </Button>
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
                placeholder="Search transfer ref, IMEI, branch..."
                value={historySearchFilter}
                onChange={(e) => setHistorySearchFilter(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-surface text-text-primary placeholder:text-text-muted border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Table Area */}
          <div className="flex-1 overflow-x-auto">
            {isLoadingMovements ? (
              <div className="flex flex-col items-center justify-center p-12 text-center text-xs text-text-muted">
                <Loader2 className="w-6 h-6 animate-spin text-primary mb-2" />
                Loading movement audit history...
              </div>
            ) : filteredMovements.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center">
                <div className="w-12 h-12 rounded-full bg-surface-hover flex items-center justify-center text-text-muted mb-3">
                  <ArrowRightLeft className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-semibold text-text-primary mb-1">
                  No Transfer Movements Recorded
                </h4>
                <p className="text-xs text-text-muted max-w-sm leading-relaxed mb-2">
                  When inter-branch shipments are dispatched, each batch reference, source origin, destination branch, and serial tracking status will appear in this ledger.
                </p>
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border bg-surface-hover/50 text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
                    <th className="px-3 py-2.5">Date & Time</th>
                    <th className="px-3 py-2.5">Handset Details</th>
                    <th className="px-3 py-2.5">IMEI</th>
                    <th className="px-3 py-2.5">Origin Branch</th>
                    <th className="px-3 py-2.5">Destination Branch</th>
                    <th className="px-3 py-2.5">Performed By</th>
                    <th className="px-3 py-2.5">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredMovements.map((mov) => (
                    <tr key={mov.id} className="hover:bg-surface-hover/40 transition-colors">
                      <td className="px-3 py-2.5 whitespace-nowrap text-text-muted">
                        {new Date(mov.created_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 font-medium text-text-primary">
                        {mov.brand} {mov.model}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-text-secondary">
                        {mov.imei1 || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-text-secondary">
                        {mov.from_branch_name || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-text-primary font-medium">
                        {mov.to_branch_name || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-text-muted">
                        {mov.performed_by_name || 'Staff'}
                      </td>
                      <td className="px-3 py-2.5 text-text-muted truncate max-w-xs">
                        {mov.notes || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};
