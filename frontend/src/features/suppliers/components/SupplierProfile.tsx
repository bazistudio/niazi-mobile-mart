import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supplierApi } from '@/services/supplier.api';
import { LedgerBook } from '@/features/ledger/components/LedgerBook';
import { Phone, MapPin, FileText, ShoppingCart, DollarSign, Calendar, Printer, Edit, CreditCard, ArrowLeft, Building2, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { usePrintStore } from '@/lib/printer';
import { downloadHtmlAsPdf } from '@/lib/printer/pdfExport';
import { usePrinterStore } from '@/features/settings/printer/store/printer.store';
import { printFormatter } from '@/features/settings/printer/utils/printFormatter';
import { useLedger } from '@/features/ledger/hooks/useLedger';
import { MakeSupplierPaymentModal } from './modals/MakeSupplierPaymentModal';
import { SupplierFormDrawer } from './modals/AddSupplierDrawer';

interface SupplierProfileProps {
  id: string;
}

export const SupplierProfile: React.FC<SupplierProfileProps> = ({ id }) => {
  const router = useRouter();
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { openPreview } = usePrintStore();
  const { settings, shopHeader, fetchSettings } = usePrinterStore();
  const [expandedPurchases, setExpandedPurchases] = useState<Record<string, boolean>>({});
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  useEffect(() => {
    if (!settings || !shopHeader) {
      fetchSettings();
    }
  }, [settings, shopHeader, fetchSettings]);

  const togglePurchase = (pid: string) => {
    setExpandedPurchases(prev => ({ ...prev, [pid]: !prev[pid] }));
  };

  const handlePrintPurchase = (e: React.MouseEvent, p: any) => {
    e.stopPropagation();
    if (!settings || !shopHeader) return;
    const html = printFormatter.formatPurchaseInvoice({
      invoiceNumber: p.purchaseNumber,
      createdAt: p.createdAt,
      supplierId: { name: detail?.supplier?.name },
      items: p.items.map((i: any) => ({ name: i.productId?.name || 'Unknown Item', qty: i.qty || i.quantity || 0, price: i.price || 0, total: (i.qty || i.quantity || 0) * (i.price || 0) })),
      totalAmount: p.totalAmount,
      paymentMethod: p.paymentMethod || 'Cash',
      status: p.status
    }, settings, shopHeader);
    openPreview({ html, documentType: 'PurchaseInvoice', referenceId: p.purchaseNumber, title: 'Purchase Invoice' });
  };

  const { rawTimeline, refetchLedger } = useLedger(detail?.supplier ? {
    id: detail.supplier.id,
    type: 'SUPPLIER',
    name: detail.supplier.name,
    balance: detail.supplier.currentBalance || 0
  } : null);

  const fetchDetail = async () => {
    try {
      const res = await supplierApi.getSupplierDetail(id);
      setDetail(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await fetchDetail();
      setLoading(false);
    };
    loadData();
  }, [id]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!detail || !detail.supplier) {
    return (
      <div className="flex justify-center items-center h-64 text-text-muted text-sm">
        Supplier not found
      </div>
    );
  }

  const { supplier, stats } = detail;
  const actualBalance = supplier.currentBalance || 0;
  const isAdvance = actualBalance > 0;
  const isPayable = actualBalance < 0;

  const handlePrintFullLedger = () => {
    if (!settings || !shopHeader || !rawTimeline) return;
    const html = printFormatter.formatLedgerStatement(
      { id: supplier.id, type: 'SUPPLIER', name: supplier.name, balance: actualBalance },
      rawTimeline,
      settings,
      shopHeader,
      'Full Ledger'
    );
    openPreview({ html, documentType: 'Generic', referenceId: 'ledger', title: 'Ledger Statement' });
  };

  const handleDownloadFullLedgerPDF = () => {
    if (!settings || !shopHeader || !rawTimeline) return;
    const html = printFormatter.formatLedgerStatement(
      { id: supplier.id, type: 'SUPPLIER', name: supplier.name, balance: actualBalance },
      rawTimeline,
      settings,
      shopHeader,
      'Full Ledger'
    );
    downloadHtmlAsPdf(html, `Ledger_${supplier.name.replace(/\s+/g, '_')}`);
  };

  const handleNewPurchase = () => {
    router.push(`/dashboard/shop-admin/import?supplierId=${supplier.id}`);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto -mt-[30px] pb-10">
      {/* Top Bar Navigation */}
      <div className="flex items-center gap-4">
        <button 
          onClick={() => router.push('/dashboard/shop-admin/suppliers')}
          className="p-1.5 hover:bg-surface-hover rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <ArrowLeft className="w-5 h-5 text-text-secondary" />
        </button>
        <h1 className="text-2xl font-black text-text-primary tracking-tight">Supplier Profile</h1>
      </div>

      {/* Wide Profile Header */}
      <div className="bg-gradient-to-r from-[#006970] to-[#008990] dark:from-[#004d52] dark:to-[#006970] rounded-3xl p-6 md:p-8 text-white shadow-lg relative overflow-hidden">
        <div className="absolute -right-20 -top-20 w-64 h-64 bg-white/5 rounded-full blur-3xl"></div>
        <div className="absolute right-20 -bottom-20 w-64 h-64 bg-black/10 rounded-full blur-3xl"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row justify-between gap-8 items-start md:items-center">
          <div className="space-y-4">
            <div>
              <h2 className="text-3xl font-black tracking-tight">{supplier.name}</h2>
              {supplier.companyName && (
                <div className="flex items-center gap-2 mt-1 text-white/80 font-medium">
                  <Building2 className="w-4 h-4" />
                  <span>{supplier.companyName}</span>
                </div>
              )}
            </div>
            
            <div className="flex flex-wrap gap-4 text-sm font-medium text-white/90">
              <div className="flex items-center gap-2 bg-black/10 px-3 py-1.5 rounded-lg backdrop-blur-sm">
                <Phone className="w-4 h-4 text-white/70" />
                <span>{supplier.phone || 'N/A'}</span>
              </div>
              <div className="flex items-center gap-2 bg-black/10 px-3 py-1.5 rounded-lg backdrop-blur-sm">
                <MapPin className="w-4 h-4 text-white/70" />
                <span>{supplier.address || 'No Address Provided'}</span>
              </div>
              <div className="flex items-center gap-2 bg-black/10 px-3 py-1.5 rounded-lg backdrop-blur-sm">
                <Calendar className="w-4 h-4 text-white/70" />
                <span>Last TX: {stats.lastTransactionDate ? new Date(stats.lastTransactionDate).toLocaleDateString() : 'N/A'}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 shrink-0 w-full md:w-auto">
            <button 
              onClick={handleNewPurchase}
              className="flex items-center justify-center gap-2 px-5 py-3 bg-white text-[#006970] hover:bg-gray-50 active:scale-95 transition-all font-bold rounded-xl shadow-sm"
            >
              <ShoppingCart className="w-5 h-5" /> New Purchase
            </button>
            <button 
              onClick={() => setIsPaymentModalOpen(true)}
              className="flex items-center justify-center gap-2 px-5 py-3 bg-orange-500 hover:bg-orange-600 active:scale-95 transition-all font-bold rounded-xl text-white shadow-sm"
            >
              <CreditCard className="w-5 h-5" /> Make Payment
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-surface rounded-xl p-5 border border-border shadow-card relative overflow-hidden group">
          <div className="absolute right-0 top-0 w-20 h-20 bg-primary/5 rounded-bl-full transition-transform group-hover:scale-110"></div>
          <div className="relative">
            <div className="w-10 h-10 bg-primary/10 text-primary rounded-lg flex items-center justify-center mb-3">
              <DollarSign className="w-5 h-5" />
            </div>
            <p className="text-xs font-bold text-text-muted uppercase tracking-widest mb-1">Total Purchases</p>
            <p className="text-2xl font-black text-text-primary tabular-nums tracking-tight">Rs {stats.totalPurchases.toLocaleString()}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm relative overflow-hidden group">
          <div className={`absolute right-0 top-0 w-24 h-24 rounded-bl-full transition-transform group-hover:scale-110 ${isPayable ? 'bg-orange-500/5 dark:bg-orange-500/10' : 'bg-green-500/5 dark:bg-green-500/10'}`}></div>
          <div className="relative">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${isPayable ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'}`}>
              <FileText className="w-6 h-6" />
            </div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">{isPayable ? 'Total Payable' : 'Advance Given'}</p>
            <p className={`text-3xl font-black tabular-nums tracking-tight ${isPayable ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}`}>
              Rs {Math.abs(actualBalance).toLocaleString()}
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm relative overflow-hidden group">
          <div className="absolute right-0 top-0 w-24 h-24 bg-[#006970]/5 dark:bg-[#006970]/10 rounded-bl-full transition-transform group-hover:scale-110"></div>
          <div className="relative">
            <div className="w-12 h-12 bg-[#006970]/10 text-[#006970] dark:bg-[#006970]/20 dark:text-[#00B4BB] rounded-xl flex items-center justify-center mb-4">
              <ShoppingCart className="w-6 h-6" />
            </div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Purchase Invoices</p>
            <p className="text-3xl font-black text-gray-900 dark:text-white tabular-nums tracking-tight">{stats.purchaseCount}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Left Column: Recent Purchases & Tools */}
        <div className="lg:col-span-1 space-y-6">
          {/* Quick Actions */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-100 dark:border-gray-800 shadow-sm space-y-2">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Export Tools</h3>
            <button 
              onClick={handlePrintFullLedger}
              className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700/80 active:scale-95 transition-all font-semibold rounded-xl text-gray-700 dark:text-gray-300"
            >
              <Printer className="w-5 h-5 text-gray-400" /> Print Ledger
            </button>
            <button 
              onClick={handleDownloadFullLedgerPDF}
              className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700/80 active:scale-95 transition-all font-semibold rounded-xl text-gray-700 dark:text-gray-300"
            >
              <Download className="w-5 h-5 text-gray-400" /> Export PDF
            </button>
            <button 
              onClick={() => setIsEditModalOpen(true)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700/80 active:scale-95 transition-all font-semibold rounded-xl text-gray-700 dark:text-gray-300 mt-4 border border-gray-200 dark:border-gray-700"
            >
              <Edit className="w-5 h-5 text-gray-400" /> Edit Supplier
            </button>
          </div>

          {/* Recent Purchases Widget */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-100 dark:border-gray-800 shadow-sm">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Recent Purchases</h3>
            <div className="space-y-3">
              {stats.recentPurchases.length === 0 && (
                <div className="text-sm text-gray-500 text-center py-6 bg-gray-50 dark:bg-gray-800/50 rounded-xl">No recent purchases</div>
              )}
              {stats.recentPurchases.length > 0 && stats.recentPurchases.map((p: any) => (
                <div key={p._id || p.purchaseNumber} className="border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden bg-white dark:bg-gray-800/20">
                  <div 
                    className="flex justify-between items-center text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/80 p-3 transition-colors"
                    onClick={() => togglePurchase(p._id || p.purchaseNumber)}
                  >
                    <div className="flex items-center gap-3">
                      <button className="text-gray-400 hover:text-[#006970]">
                        {expandedPurchases[p._id || p.purchaseNumber] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                      <div>
                        <div className="font-bold text-gray-900 dark:text-white tracking-tight">{p.purchaseNumber || p.transactionId}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{new Date(p.createdAt || p.timestamp).toLocaleDateString()}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-right">
                      <div>
                        <div className="font-black text-gray-900 dark:text-white tabular-nums">Rs {(p.totalAmount || p.amount)?.toLocaleString()}</div>
                        {p.status && (
                          <div className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full inline-block mt-1 ${p.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                            {p.status}
                          </div>
                        )}
                      </div>
                      <button 
                        onClick={(e) => handlePrintPurchase(e, p)}
                        className="p-2 text-gray-400 hover:text-[#006970] hover:bg-[#006970]/10 rounded-lg transition-colors"
                        title="Print/PDF"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  
                  {expandedPurchases[p._id || p.purchaseNumber] && p.items && (
                    <div className="px-3 pb-3 pt-1 bg-gray-50 dark:bg-gray-800/80 text-xs space-y-1.5 border-t border-gray-100 dark:border-gray-800">
                      <div className="font-bold text-gray-400 uppercase tracking-widest flex justify-between pb-1">
                        <span>Item</span>
                        <span>Amount</span>
                      </div>
                      {p.items.map((item: any, idx: number) => (
                        <div key={idx} className="flex justify-between text-gray-700 dark:text-gray-300 font-medium">
                          <span>{item.qty || item.quantity}x {item.productId?.name || 'Item'}</span>
                          <span className="tabular-nums">Rs {((item.qty || item.quantity) * item.price).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Ledger Component */}
        <div className="lg:col-span-3">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden h-full">
            <LedgerBook 
              initialParty={{
                id: supplier.id,
                type: 'SUPPLIER',
                name: supplier.name,
                balance: actualBalance
              }}
              readonly={true}
            />
          </div>
        </div>

      </div>

      <MakeSupplierPaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        supplier={supplier}
        onPaymentSuccess={() => {
          fetchDetail();
          refetchLedger();
        }}
      />

      <SupplierFormDrawer
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        suppliers={[]} // Pass empty or fetched if needed, only used for phone dupe check
        editingSupplier={supplier}
      />
    </div>
  );
};
