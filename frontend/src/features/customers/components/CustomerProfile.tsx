import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { customerApi } from '@/services/customer.api';
import { LedgerBook } from '@/features/ledger/components/LedgerBook';
import { InvoicePreviewModal } from '@/features/history/components/InvoicePreviewModal';
import { HistoryItem } from '@/features/history/types/history.types';
import { Phone, MapPin, FileText, ShoppingCart, DollarSign, Calendar, Printer, Edit, Plus, CreditCard, ArrowLeft, ChevronDown, ChevronUp, Download, Loader2, Scale } from 'lucide-react';
import { usePrintStore } from '@/lib/printer';
import { downloadHtmlAsPdf } from '@/lib/printer/pdfExport';
import { usePrinterStore } from '@/features/settings/printer/store/printer.store';
import { printFormatter } from '@/features/settings/printer/utils/printFormatter';
import { useLedger } from '@/features/ledger/hooks/useLedger';
import { ReceivePaymentModal } from './ledger/ReceivePaymentModal';
import { SetOpeningBalanceModal } from './modals/SetOpeningBalanceModal';
import { useAuthStore } from '@/lib/auth/core/auth.store';
import { Badge } from '@/components/ui';

interface CustomerProfileProps {
  id: string;
}

/** Shared card container style */
const cardClass = 'bg-surface rounded-xl border border-border shadow-card';

export const CustomerProfile: React.FC<CustomerProfileProps> = ({ id }) => {
  const navigate = useNavigate();
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { openPreview } = usePrintStore();
  const { settings, shopHeader, isHydrated, fetchSettings } = usePrinterStore();
  const [expandedInvoices, setExpandedInvoices] = useState<Record<string, boolean>>({});
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isOpeningBalanceModalOpen, setIsOpeningBalanceModalOpen] = useState(false);
  const [previewHistoryItem, setPreviewHistoryItem] = useState<HistoryItem | null>(null);
  const [isPdfLoading, setIsPdfLoading] = useState(false);

  const { user } = useAuthStore();
  const isOrgAdmin = user?.role === 'ADMIN';

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const toggleInvoice = (id: string) => {
    setExpandedInvoices(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handlePrintInvoice = (e: React.MouseEvent, inv: any) => {
    e.stopPropagation();
    if (!isHydrated || !settings || !shopHeader) return;

    const hasMobileLines = inv.items && inv.items.some((i: any) => i.lineType === 'MOBILE' || i.imei || i.serialNumber);
    const invoiceData = {
      orderNumber: inv.orderNumber,
      invoiceNumber: inv.orderNumber,
      createdAt: inv.createdAt,
      customer: { name: detail?.customer?.name, phone: detail?.customer?.phone, address: detail?.customer?.address },
      customerId: { name: detail?.customer?.name, phone: detail?.customer?.phone },
      items: inv.items.map((i: any) => ({
        name: i.productId?.name || i.name || 'Item',
        qty: i.qty || i.quantity || 0,
        price: i.price || 0,
        total: (i.qty || i.quantity || 0) * (i.price || 0),
        imei: i.imei || i.serialNumber,
        specs: i.specs || undefined,
      })),
      totalAmount: inv.totalAmount,
      subtotal: inv.totalAmount,
      total: inv.totalAmount,
      paymentMethod: inv.paymentMethod || 'Cash',
      status: inv.status,
    };

    const html = hasMobileLines
      ? printFormatter.formatMobileSaleInvoice(invoiceData, settings, shopHeader)
      : printFormatter.formatSaleInvoice(invoiceData, settings, shopHeader);
    const docType = hasMobileLines ? 'MobileSaleInvoice' : 'SaleInvoice';
    openPreview({ html, documentType: docType as any, referenceId: inv.orderNumber, title: `${docType === 'MobileSaleInvoice' ? 'Mobile Sale Invoice' : 'Sale Invoice'} - ${inv.orderNumber}` });
  };

  const { rawTimeline } = useLedger(detail?.customer ? {
    id: detail.customer.id,
    type: 'CUSTOMER',
    name: detail.customer.name,
    balance: detail.stats.outstanding
  } : null);

  const fetchDetail = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await customerApi.getCustomerDetail(id);
      setDetail(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!detail || !detail.customer) {
    return (
      <div className="flex justify-center items-center h-64 text-text-muted text-sm">
        Customer not found
      </div>
    );
  }

  const { customer, stats } = detail;
  const isCredit = stats.outstanding < 0;

  const handlePrintFullLedger = () => {
    if (!isHydrated || !settings || !shopHeader || !rawTimeline) return;
    const html = printFormatter.formatLedgerStatement(
      { id: customer.id, type: 'CUSTOMER', name: customer.name, balance: stats.outstanding },
      rawTimeline,
      settings,
      shopHeader,
      'Full Ledger'
    );
    openPreview({ html, documentType: 'Generic', referenceId: 'ledger', title: 'Ledger Statement' });
  };

  const handleDownloadFullLedgerPDF = async () => {
    if (!isHydrated || !settings || !shopHeader || !rawTimeline) return;
    if (isPdfLoading) return;
    setIsPdfLoading(true);
    toast.loading('Preparing PDF...', { id: 'ledger-pdf' });
    try {
      const html = printFormatter.formatLedgerStatement(
        { id: customer.id, type: 'CUSTOMER', name: customer.name, balance: stats.outstanding },
        rawTimeline,
        settings,
        shopHeader,
        'Full Ledger'
      );
      await downloadHtmlAsPdf(html, `Ledger_${customer.name.replace(/\s+/g, '_')}`);
      toast.success('PDF download started.', { id: 'ledger-pdf' });
    } catch (err) {
      toast.error('Failed to generate PDF. Please try again.', { id: 'ledger-pdf' });
    } finally {
      setIsPdfLoading(false);
    }
  };

  /** Reusable quick action button class */
  const actionBtnClass =
    'w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring';

  return (
    <div className="space-y-4 w-full -mt-[20px] px-1 sm:px-2">
      {/* Top Bar */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Go back"
          className="p-1.5 hover:bg-surface-hover rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5 text-text-secondary" />
        </button>
        <h1 className="text-2xl font-bold text-text-primary">Customer Profile</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5">

        {/* Left Column: Details & Quick Actions */}
        <div className="lg:col-span-4 xl:col-span-3 space-y-4">

          {/* Profile Card */}
          <div className={`${cardClass} p-5 flex flex-col items-center text-center`}>
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center text-primary text-2xl font-black mb-3">
              {customer.name.charAt(0).toUpperCase()}
            </div>
            <h2 className="text-lg font-bold text-text-primary mb-1">{customer.name}</h2>

            <div className="space-y-2 mt-3 text-left w-full text-sm">
              {[
                { Icon: Phone, value: customer.phone || 'N/A' },
                { Icon: MapPin, value: customer.address || 'N/A' },
                {
                  Icon: Calendar,
                  value: `Last TX: ${stats.lastTransactionDate ? new Date(stats.lastTransactionDate).toLocaleDateString() : 'N/A'}`,
                },
              ].map(({ Icon, value }, i) => (
                <div key={i} className="flex items-center gap-2.5 text-text-secondary">
                  <Icon className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
                  <span className="truncate">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div className={`${cardClass} p-4 space-y-1.5`}>
            <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Quick Actions</h3>
            <button
              type="button"
              onClick={() => navigate(`/dashboard/shop-admin/pos?customerId=${customer.id}`)}
              className={`${actionBtnClass} bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer`}
            >
              <ShoppingCart className="w-4 h-4" /> New Sale
            </button>
            <button
              type="button"
              onClick={() => setIsPaymentModalOpen(true)}
              className={`${actionBtnClass} bg-success/10 text-success hover:bg-success/20`}
            >
              <CreditCard className="w-4 h-4" /> Receive Payment
            </button>
            {isOrgAdmin && (
              <button
                type="button"
                onClick={() => setIsOpeningBalanceModalOpen(true)}
                className={`${actionBtnClass} bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 dark:text-blue-400 dark:hover:bg-blue-400/20`}
                title="Set an opening balance for this customer (org-admin only)"
              >
                <Scale className="w-4 h-4" /> Set Opening Balance
              </button>
            )}
            <button
              type="button"
              onClick={handlePrintFullLedger}
              className={`${actionBtnClass} text-text-secondary hover:bg-surface-hover`}
            >
              <Printer className="w-4 h-4 text-text-muted" /> Print Ledger
            </button>
            <button
              type="button"
              onClick={handleDownloadFullLedgerPDF}
              disabled={isPdfLoading}
              className={`${actionBtnClass} text-text-secondary hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <Download className="w-4 h-4 text-text-muted" /> {isPdfLoading ? 'Preparing PDF...' : 'Export PDF'}
            </button>
            <button
              type="button"
              className={`${actionBtnClass} text-text-secondary hover:bg-surface-hover`}
            >
              <Edit className="w-4 h-4 text-text-muted" /> Edit Customer
            </button>
          </div>

          {/* Recent Sales Widget */}
          <div className={`${cardClass} p-4`}>
            <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">Recent Sales</h3>
            <div className="space-y-2">
              {stats.recentInvoices.length === 0 && (
                <div className="text-sm text-text-muted text-center py-4">No recent sales</div>
              )}
              {stats.recentInvoices.length > 0 &&
                stats.recentInvoices.slice(0, 5).map((inv: any) => (
                  <div key={inv._id || inv.orderNumber} className="border-b border-border pb-2 last:border-0 last:pb-0">
                    <div
                      className="flex justify-between items-center text-sm cursor-pointer hover:bg-surface-hover p-1.5 rounded-md transition-colors"
                      onClick={() => toggleInvoice(inv._id || inv.orderNumber)}
                    >
                      <div className="flex items-center gap-2">
                        <button type="button" className="text-text-muted hover:text-primary" aria-label="Toggle items">
                          {expandedInvoices[inv._id || inv.orderNumber] ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <div>
                          <div className="font-semibold text-text-primary text-xs">{inv.orderNumber}</div>
                          <div className="text-[11px] text-text-muted">
                            {new Date(inv.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-right">
                        <div>
                          <div className="font-bold text-text-primary text-xs">Rs {inv.totalAmount?.toLocaleString()}</div>
                          <Badge
                            variant={inv.status === 'paid' ? 'success' : 'warning'}
                            size="sm"
                          >
                            {inv.status}
                          </Badge>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewHistoryItem({
                              id: inv._id || inv.orderNumber,
                              referenceId: inv.orderNumber,
                              type: "sale",
                              party: { id: customer.id, name: customer.name, type: "customer" },
                              amount: inv.totalAmount || 0,
                              status: inv.status === "paid" ? "paid" : "pending",
                              source: "pos",
                              createdAt: inv.createdAt || new Date().toISOString(),
                            });
                          }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold text-[#006970] bg-[#006970]/10 hover:bg-[#006970]/20 dark:text-teal-400 dark:bg-teal-900/30 rounded transition-colors"
                          title="Invoice Details"
                        >
                          <FileText className="w-3 h-3" />
                          <span>Details</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handlePrintInvoice(e, inv)}
                          className="p-1 text-text-muted hover:text-primary hover:bg-primary/10 rounded transition-colors"
                          title="Print/PDF"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {expandedInvoices[inv._id || inv.orderNumber] && inv.items && (
                      <div className="mt-1.5 ml-7 mr-1 py-2 px-3 bg-surface-hover rounded-md text-xs space-y-1">
                        <div className="font-bold text-text-muted mb-1 flex justify-between border-b border-border pb-1">
                          <span>Item</span>
                          <span>Amount</span>
                        </div>
                        {inv.items.slice(0, 3).map((item: any, idx: number) => (
                          <div key={idx} className="flex justify-between text-text-secondary">
                            <span>{item.qty || item.quantity}× {item.productId?.name || 'Item'}</span>
                            <span>Rs {((item.qty || item.quantity) * item.price).toLocaleString()}</span>
                          </div>
                        ))}
                        {inv.items.length > 3 && (
                          <div className="text-center text-[10px] text-text-muted italic mt-1 pt-1 border-t border-border">
                            +{inv.items.length - 3} more items
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* Right Column: KPIs & Ledger */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-4">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Total Sales */}
            <div className={`${cardClass} p-5 flex items-center gap-4`}>
              <div className="p-2.5 bg-primary/10 text-primary rounded-lg flex-shrink-0">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-text-muted uppercase tracking-wider">Total Sales</p>
                <p className="text-xl font-black text-text-primary tabular-nums">
                  Rs {stats.totalSales.toLocaleString()}
                </p>
              </div>
            </div>

            {/* Outstanding / Advance */}
            <div className={`${cardClass} p-5 flex items-center gap-4`}>
              <div className={`p-2.5 rounded-lg flex-shrink-0 ${isCredit ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-text-muted uppercase tracking-wider">
                  {isCredit ? 'Advance' : 'Outstanding'}
                </p>
                <p className={`text-xl font-black tabular-nums ${isCredit ? 'text-success' : 'text-warning'}`}>
                  Rs {Math.abs(stats.outstanding).toLocaleString()}
                </p>
              </div>
            </div>

            {/* Invoices */}
            <div className={`${cardClass} p-5 flex items-center gap-4`}>
              <div className="p-2.5 bg-secondary/10 text-secondary rounded-lg flex-shrink-0">
                <ShoppingCart className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-text-muted uppercase tracking-wider">Invoices</p>
                <p className="text-xl font-black text-text-primary tabular-nums">{stats.invoiceCount}</p>
              </div>
            </div>
          </div>

          {/* LedgerBook */}
          <LedgerBook
            initialParty={{
              id: customer.id,
              type: 'CUSTOMER',
              name: customer.name,
              balance: stats.outstanding,
            }}
            readonly={true}
          />
        </div>
      </div>

      {previewHistoryItem && (
        <InvoicePreviewModal
          item={previewHistoryItem}
          onClose={() => setPreviewHistoryItem(null)}
        />
      )}

      <ReceivePaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        customer={customer}
        onPaymentSuccess={fetchDetail}
      />

      {/* SetOpeningBalanceModal — org-admin only; backend enforces the same guard */}
      {isOrgAdmin && (
        <SetOpeningBalanceModal
          isOpen={isOpeningBalanceModalOpen}
          onClose={() => setIsOpeningBalanceModalOpen(false)}
          customerId={customer.id}
          customerName={customer.name}
          onSuccess={fetchDetail}
        />
      )}
    </div>
  );
};
