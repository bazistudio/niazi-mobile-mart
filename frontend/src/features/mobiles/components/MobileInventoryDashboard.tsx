'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Smartphone,
  Plus,
  Search,
  Filter,
  ShieldCheck,
  Tag,
  SlidersHorizontal,
  FileText,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { Button, Badge, Card } from '@/components/ui';
import { useOrganizationStore } from '@/store/useOrganizationStore';
import { mobileApi, mapDeviceRowToItem } from '../services/mobile.api';
import type { MobileInventoryItem, MobileCondition } from '../types/mobile.types';

export const MobileInventoryDashboard: React.FC = () => {
  const navigate = useNavigate();
  const activeShop = useOrganizationStore((s) => s.activeShop);
  const activeShopId = useOrganizationStore((s) => s.activeShopId);
  const branchId = activeShopId || activeShop?._id || activeShop?.id || undefined;

  const [items, setItems] = useState<MobileInventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'ALL' | MobileCondition>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [ptaFilter, setPtaFilter] = useState<string>('ALL');

  const fetchMobiles = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const res = await mobileApi.getMobiles({
        branch_id: branchId,
        limit: 200,
      });
      const mapped = (res.devices || []).map(mapDeviceRowToItem);
      setItems(mapped);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load mobile inventory';
      setFetchError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    fetchMobiles();
  }, [fetchMobiles]);

  // Filter items based on active tab and search
  const filteredItems = items.filter((item) => {
    // Condition tab filter
    if (activeTab !== 'ALL' && item.condition !== activeTab) {
      return false;
    }
    // PTA filter
    if (ptaFilter !== 'ALL' && item.ptaStatus !== ptaFilter) {
      return false;
    }
    // Search filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchBrand = item.brand.toLowerCase().includes(q);
      const matchModel = item.model.toLowerCase().includes(q);
      const matchImei = item.imei1.includes(q);
      const matchSeller = item.sellerName?.toLowerCase().includes(q) ?? false;
      const matchVoucher = item.voucherNo?.toLowerCase().includes(q) ?? false;
      return matchBrand || matchModel || matchImei || matchSeller || matchVoucher;
    }
    return true;
  });

  const allCount = items.length;
  const newCount = items.filter((m) => m.condition === 'NEW').length;
  const usedCount = items.filter((m) => m.condition === 'USED').length;

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto pb-16 px-4 sm:px-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-text-primary tracking-tight">
                Mobile Inventory
              </h1>
              <p className="text-sm text-text-secondary mt-0.5">
                Manage serialized smartphones, IMEI tracking, and digitized used-purchase affidavits separately from accessories.
              </p>
            </div>
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="md"
            leftIcon={<RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />}
            onClick={fetchMobiles}
            disabled={isLoading}
            className="shadow-xs cursor-pointer"
            title="Refresh Inventory"
          >
            Refresh
          </Button>

          <Button
            variant="primary"
            size="md"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => navigate('/dashboard/shop-admin/mobiles/add')}
            className="shadow-sm font-semibold"
          >
            Add Mobile
          </Button>
        </div>
      </div>

      {/* Error Banner if API call fails */}
      {fetchError && (
        <div className="p-4 bg-danger/10 border border-danger/20 rounded-lg flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-sm text-danger">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{fetchError}</span>
          </div>
          <Button variant="outline" size="sm" onClick={fetchMobiles}>
            Retry
          </Button>
        </div>
      )}

      {/* Tabs & Search Filter Bar */}
      <Card variant="default" padding="sm" className="bg-surface border-border">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Condition Filter Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-surface-hover rounded-lg border border-border/60 self-start md:self-auto">
            <button
              type="button"
              onClick={() => setActiveTab('ALL')}
              className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'ALL'
                  ? 'bg-surface text-primary font-semibold shadow-xs border border-border'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              All Mobiles
              <Badge variant={activeTab === 'ALL' ? 'primary' : 'neutral'} size="sm">
                {allCount}
              </Badge>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('NEW')}
              className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'NEW'
                  ? 'bg-surface text-primary font-semibold shadow-xs border border-border'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              New Mobiles
              <Badge variant={activeTab === 'NEW' ? 'success' : 'neutral'} size="sm">
                {newCount}
              </Badge>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('USED')}
              className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'USED'
                  ? 'bg-surface text-primary font-semibold shadow-xs border border-border'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Used Mobiles
              <Badge variant={activeTab === 'USED' ? 'warning' : 'neutral'} size="sm">
                {usedCount}
              </Badge>
            </button>
          </div>

          {/* Search & PTA Status Filter */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="relative min-w-[240px]">
              <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search Brand, Model, IMEI, Seller..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-sm bg-surface text-text-primary placeholder:text-text-muted border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-focus-ring"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={ptaFilter}
                onChange={(e) => setPtaFilter(e.target.value)}
                aria-label="Filter by PTA Registration Status"
                className="px-3 py-1.5 text-sm bg-surface text-text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-focus-ring cursor-pointer"
              >
                <option value="ALL">All PTA Statuses</option>
                <option value="PTA_APPROVED">PTA Approved</option>
                <option value="NON_PTA">Non-PTA</option>
                <option value="JV">JV</option>
                <option value="GEVEY">Gevey</option>
              </select>
            </div>
          </div>
        </div>
      </Card>

      {/* Inventory Table Layout */}
      {filteredItems.length > 0 ? (
        <div className="bg-surface rounded-lg border border-border shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-hover/80 text-text-secondary text-xs uppercase font-semibold border-b border-border">
                <tr>
                  <th className="py-3 px-4">Device / Model</th>
                  <th className="py-3 px-4">Condition</th>
                  <th className="py-3 px-4">Specs & Color</th>
                  <th className="py-3 px-4">IMEI Identifier</th>
                  <th className="py-3 px-4">PTA Status</th>
                  <th className="py-3 px-4 text-right">Cost (Rs)</th>
                  <th className="py-3 px-4 text-right">Sale Price (Rs)</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredItems.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-surface-hover/50 transition-colors group"
                  >
                    {/* Device / Model */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-text-primary">{item.brand} {item.model}</div>
                      {item.voucherNo && (
                        <div className="text-xs text-text-muted flex items-center gap-1 mt-0.5">
                          <FileText className="w-3 h-3 text-primary" />
                          <span>Voucher #{item.voucherNo}</span>
                          {item.sellerName && (
                            <span className="text-text-secondary">({item.sellerName})</span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Condition */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {item.condition === 'NEW' ? (
                        <Badge variant="success" size="sm">
                          New (Boxed)
                        </Badge>
                      ) : (
                        <Badge variant="warning" size="sm">
                          Used (Pre-Owned)
                        </Badge>
                      )}
                    </td>

                    {/* Specs & Color */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="text-text-primary font-medium">{item.storage} / {item.ram} RAM</div>
                      <div className="text-xs text-text-muted">{item.color}</div>
                    </td>

                    {/* IMEI Identifier */}
                    <td className="py-3.5 px-4 whitespace-nowrap font-mono text-xs text-text-primary">
                      {item.imei1}
                    </td>

                    {/* PTA Status */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {item.ptaStatus === 'PTA_APPROVED' ? (
                        <span className="inline-flex items-center gap-1 text-xs text-success font-medium">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          PTA Approved
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-warning font-medium">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          {item.ptaStatus}
                        </span>
                      )}
                    </td>

                    {/* Purchase Cost */}
                    <td className="py-3.5 px-4 text-right font-medium text-text-secondary whitespace-nowrap">
                      Rs. {item.purchaseCost.toLocaleString()}
                    </td>

                    {/* Sale Price */}
                    <td className="py-3.5 px-4 text-right font-semibold text-primary whitespace-nowrap">
                      Rs. {item.salePrice.toLocaleString()}
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      <Badge variant="primary" size="sm" dot>
                        In Stock
                      </Badge>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() =>
                          alert(
                            `Device: ${item.brand} ${item.model}\nCondition: ${item.condition}\nIMEI: ${item.imei1}\nPTA Status: ${item.ptaStatus}\nPurchase Cost: Rs. ${item.purchaseCost.toLocaleString()}\nExpected Sale: Rs. ${item.salePrice.toLocaleString()}\nStatus: ${item.status}`
                          )
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 rounded transition-colors cursor-pointer"
                        title="View details"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Directory Footer Info */}
          <div className="px-4 py-3 bg-surface-hover/40 border-t border-border flex flex-col sm:flex-row items-center justify-between text-xs text-text-muted gap-2">
            <span>
              Showing {filteredItems.length} of {items.length} mobile records
            </span>
            <span className="text-text-secondary">
              Serialized device records are decoupled from regular spare parts inventory.
            </span>
          </div>
        </div>
      ) : (
        /* Empty State */
        <Card variant="default" padding="lg" className="text-center py-16 bg-surface border-border">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <Smartphone className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-1">
            No mobile phones found
          </h3>
          <p className="text-sm text-text-muted max-w-md mx-auto mb-6">
            {searchTerm || ptaFilter !== 'ALL' || activeTab !== 'ALL'
              ? 'No mobile records match your current filter criteria. Try clearing filters or adjusting your search keyword.'
              : 'Start logging your smartphone stock. New units and used devices with purchase paperwork affidavits will appear here.'}
          </p>
          <div className="flex items-center justify-center gap-3">
            {(searchTerm || ptaFilter !== 'ALL' || activeTab !== 'ALL') && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchTerm('');
                  setPtaFilter('ALL');
                  setActiveTab('ALL');
                }}
              >
                Clear Filters
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => navigate('/dashboard/shop-admin/mobiles/add')}
            >
              Add Mobile
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
};
