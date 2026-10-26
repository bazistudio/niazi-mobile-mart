import React, { useState } from 'react';
import {
  BookOpen,
  X,
  Search,
  ShoppingCart,
  Tags,
  Smartphone,
  Coins,
  Receipt,
  Users,
  ShieldCheck,
  Store,
  Database,
  Printer,
  Info,
  ChevronRight,
  ExternalLink,
  Lock,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface UserGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSection?: string;
}

interface GuideSection {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  route?: string;
  content: React.ReactNode;
}

export const UserGuideModal: React.FC<UserGuideModalProps> = ({
  isOpen,
  onClose,
  initialSection = 'overview',
}) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(initialSection);
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  const sections: GuideSection[] = [
    {
      id: 'overview',
      title: 'Application Overview & Navigation',
      icon: BookOpen,
      route: '/dashboard/shop-admin',
      content: (
        <div className="space-y-4">
          <p className="text-sm text-text-secondary leading-relaxed">
            Welcome to <strong>Niazi Mobile Mart Desktop ERP & POS System</strong>. The application operates across two primary surfaces:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <div className="p-3.5 rounded-lg border border-border bg-surface-hover/30">
              <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider mb-1">
                Branch Dashboard Shell
              </h4>
              <p className="text-xs text-text-muted">
                Daily retail operations for cashiers, salesmen, managers, and branch administrators. Handles Point of Sale, retail inventory, IMEI tracking, cash register management, and local expenses.
              </p>
            </div>
            <div className="p-3.5 rounded-lg border border-border bg-surface-hover/30">
              <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider mb-1">
                Organization Control Shell
              </h4>
              <p className="text-xs text-text-muted">
                Centralized multi-branch control for Owners and Super Administrators. Oversees consolidated sales, workforce accounts, branch retail outlets, and cross-branch ledger reporting.
              </p>
            </div>
          </div>
          <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider pt-2">Global Keyboard Shortcuts</h4>
          <ul className="text-xs text-text-muted space-y-1.5 list-disc pl-4">
            <li><kbd className="px-1.5 py-0.5 rounded bg-surface border border-border font-mono text-[10px] text-text-primary">Ctrl + P</kbd> — Open Point of Sale (POS) terminal.</li>
            <li><kbd className="px-1.5 py-0.5 rounded bg-surface border border-border font-mono text-[10px] text-text-primary">Ctrl + D</kbd> — Fast navigate to Branch Dashboard.</li>
            <li><kbd className="px-1.5 py-0.5 rounded bg-surface border border-border font-mono text-[10px] text-text-primary">Ctrl + I</kbd> — Fast navigate to Products & Inventory catalog.</li>
            <li><kbd className="px-1.5 py-0.5 rounded bg-surface border border-border font-mono text-[10px] text-text-primary">Ctrl + O</kbd> — Navigate to Operational Expenses.</li>
            <li><kbd className="px-1.5 py-0.5 rounded bg-surface border border-border font-mono text-[10px] text-text-primary">Ctrl + L</kbd> — Instantly lock terminal with PIN protection.</li>
          </ul>
        </div>
      ),
    },
    {
      id: 'pos',
      title: 'POS & Sales Workflows',
      icon: ShoppingCart,
      route: '/dashboard/shop-admin/pos',
      content: (
        <div className="space-y-4">
          <p className="text-sm text-text-secondary leading-relaxed">
            The Point of Sale terminal (<kbd className="px-1 py-0.5 rounded bg-surface border border-border font-mono text-[10px]">Ctrl+P</kbd>) is optimized for high-speed barcode scanning, multi-customer tabs, and credit account settlements.
          </p>
          <div className="space-y-2 text-xs text-text-muted">
            <div className="p-3 rounded-lg border border-border bg-surface">
              <strong className="text-text-primary">1. Multi-Tab Selling:</strong> Cashiers can hold up to 5 concurrent sale tabs at once without losing cart items when a customer steps aside.
            </div>
            <div className="p-3 rounded-lg border border-border bg-surface">
              <strong className="text-text-primary">2. Cash Drawer Session Guard:</strong> POS sales cannot be concluded without an active, OPEN cash session for the current branch. If the register is closed, open it via the POS header or Cash Management.
            </div>
            <div className="p-3 rounded-lg border border-border bg-surface">
              <strong className="text-text-primary">3. Returns & Exchanges:</strong> Click the "Return / Exchange" button in the POS header to search previous sales by invoice number and process partial or full item returns.
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'inventory',
      title: 'Inventory & Mobile Asset Tracking',
      icon: Tags,
      route: '/dashboard/shop-admin/inventory',
      content: (
        <div className="space-y-4">
          <p className="text-sm text-text-secondary leading-relaxed">
            Inventory is divided into general retail products (accessories, parts) and serialized IMEI mobile devices.
          </p>
          <div className="space-y-2 text-xs text-text-muted">
            <div className="p-3 rounded-lg border border-border bg-surface">
              <strong className="text-text-primary">Products & Stock Catalog:</strong> Manage standard SKUs, purchase prices, retail selling rates, low-stock threshold triggers, and stock adjustments.
            </div>
            <div className="p-3 rounded-lg border border-border bg-surface">
              <strong className="text-text-primary">Mobile Inventory (IMEI):</strong> Dedicated tracking for mobile handsets. Every phone is tracked by its dual IMEI numbers, condition, purchase source, and seller CNIC record.
            </div>
            <div className="p-3 rounded-lg border border-border bg-surface">
              <strong className="text-text-primary">Stock Transfers:</strong> Move stock between branches with automated outbox audit events and branch verification.
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'cash',
      title: 'Cash Management, Vouchers & Expenses',
      icon: Coins,
      route: '/dashboard/shop-admin/cash',
      content: (
        <div className="space-y-4">
          <p className="text-sm text-text-secondary leading-relaxed">
            Cash management enforces strict cash drawer accountability across shifts and days.
          </p>
          <div className="space-y-2 text-xs text-text-muted">
            <div className="p-3 rounded-lg border border-border bg-surface">
              <strong className="text-text-primary">Midnight Persistence:</strong> Open cash sessions remain active across calendar days until explicitly closed by the cashier or shop admin.
            </div>
            <div className="p-3 rounded-lg border border-border bg-surface">
              <strong className="text-text-primary">Direct Cash Vouchers:</strong> Use the action buttons on the active cash card to record:
              <ul className="list-disc pl-4 mt-1 space-y-0.5">
                <li><strong>Receive Payment:</strong> Cash received from credit customers against outstanding ledger receivables.</li>
                <li><strong>Add Expense:</strong> Shop utility bills, tea/refreshments, rent, or maintenance paid from drawer cash.</li>
                <li><strong>Pay Supplier:</strong> Cash payments disbursed to wholesale vendors reducing trade payables.</li>
              </ul>
            </div>
            <div className="p-3 rounded-lg border border-border bg-surface">
              <strong className="text-text-primary">Closing Day:</strong> Count physical cash, enter the actual drawer total, and review variance before finalizing the session closure.
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'workforce',
      title: 'Users & Staff Administration',
      icon: Users,
      route: '/dashboard/shop-admin/settings/workforce',
      content: (
        <div className="space-y-4">
          <p className="text-sm text-text-secondary leading-relaxed">
            Staff user lifecycle management is accessible to authorized administrators via <strong>Settings &gt; Workforce</strong>.
          </p>
          <div className="space-y-2 text-xs text-text-muted">
            <div className="p-3 rounded-lg border border-border bg-surface">
              <strong className="text-text-primary">Staff Account Creation:</strong> Administrators can register new employees with a username, full name, phone number, designated role, and starting password.
            </div>
            <div className="p-3 rounded-lg border border-border bg-surface">
              <strong className="text-text-primary">Branch Assignment:</strong> Staff accounts are scoped to a specific branch or authorized across the whole organization for managerial roles.
            </div>
            <div className="p-3 rounded-lg border border-border bg-surface">
              <strong className="text-text-primary">Security PINs:</strong> Each staff member is assigned a 4-to-6 digit numeric PIN used for quick POS authorization and terminal unlocking.
            </div>
            <div className="p-3 rounded-lg border border-border bg-surface">
              <strong className="text-text-primary">Account Suspension:</strong> Staff can be suspended or reactivated instantly without deleting historical sales records.
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'roles',
      title: 'Roles & Access Permissions',
      icon: ShieldCheck,
      route: '/dashboard/organization/settings?tab=roles',
      content: (
        <div className="space-y-4">
          <p className="text-sm text-text-secondary leading-relaxed">
            The system employs role-based access control (RBAC) enforced by backend JWT claims and frontend route guards.
          </p>
          <div className="space-y-2 text-xs text-text-muted">
            <div className="p-3 rounded-lg border border-border bg-surface">
              <strong className="text-text-primary">Standard Roles:</strong>
              <ul className="list-disc pl-4 mt-1 space-y-0.5">
                <li><strong>OWNER / SUPER_ADMIN:</strong> Unrestricted multi-branch governance, financial ledger, and system configuration.</li>
                <li><strong>ADMIN / MULTI_ADMIN:</strong> Cross-branch operational oversight, workforce management, and report auditing.</li>
                <li><strong>SHOP_ADMIN / MANAGER:</strong> Full operational control restricted to their assigned branch.</li>
                <li><strong>CASHIER:</strong> POS sales, returns, and cash register session operations.</li>
                <li><strong>SALESMAN:</strong> Catalog search, price checks, and quotation generation.</li>
              </ul>
            </div>
            <div className="p-3 rounded-lg border border-border bg-surface">
              <strong className="text-text-primary">Security Principle:</strong> Menu item visibility is an interface convenience; all database transactions, ledger adjustments, and API endpoints validate user permissions server-side.
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'branches',
      title: 'Branch Management & Outlets',
      icon: Store,
      route: '/dashboard/organization/settings?tab=branches',
      content: (
        <div className="space-y-4">
          <p className="text-sm text-text-secondary leading-relaxed">
            Multi-branch retail outlets are managed centrally from the Organization Control shell.
          </p>
          <div className="space-y-2 text-xs text-text-muted">
            <div className="p-3 rounded-lg border border-border bg-surface">
              <strong className="text-text-primary">Switching Context:</strong> Use the <strong>Shop Switcher</strong> in the top header to alternate between branches without signing out (for authorized multi-branch users).
            </div>
            <div className="p-3 rounded-lg border border-border bg-surface">
              <strong className="text-text-primary">Branch Configuration:</strong> Add or configure store locations, physical addresses, receipt contact numbers, and operational active statuses.
            </div>
            <div className="p-3 rounded-lg border border-border bg-surface">
              <strong className="text-text-primary">Branch Isolation:</strong> Each branch maintains its own cash drawer session, local inventory quantities, and register history.
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'backup',
      title: 'Database Backup & Recovery',
      icon: Database,
      route: '/dashboard/organization/settings?tab=backup',
      content: (
        <div className="space-y-4">
          <p className="text-sm text-text-secondary leading-relaxed">
            Database backup and recovery controls are centralized under Organization Settings to safeguard against accidental data corruption.
          </p>
          <div className="p-3 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 text-xs">
            <strong>Safety Warning:</strong> Restoring an older database snapshot replaces current sales, cash sessions, and customer transactions across all branches. Database restore operations must only be executed by authorized system administrators during maintenance windows.
          </div>
          <div className="space-y-2 text-xs text-text-muted">
            <div className="p-3 rounded-lg border border-border bg-surface">
              <strong className="text-text-primary">Current Status:</strong> View backup snapshot schedules, retention policies, and storage sizes under <em>Organization Settings &gt; Backup &amp; Restore</em>.
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'printer',
      title: 'Printer & Hardware Setup',
      icon: Printer,
      route: '/dashboard/shop-admin/settings/printer',
      content: (
        <div className="space-y-4">
          <p className="text-sm text-text-secondary leading-relaxed">
            Configure receipt and invoice printers for POS checkout and transaction histories.
          </p>
          <div className="space-y-2 text-xs text-text-muted">
            <div className="p-3 rounded-lg border border-border bg-surface">
              <strong className="text-text-primary">Supported Printer Types:</strong> Standard 80mm thermal receipt printers, 58mm mini receipt printers, and standard desktop A4 document printers.
            </div>
            <div className="p-3 rounded-lg border border-border bg-surface">
              <strong className="text-text-primary">Configuration:</strong> Select printer devices, set custom header/footer receipt text, and run test print jobs under <strong>Settings &gt; Printer</strong>.
            </div>
          </div>
        </div>
      ),
    },
  ];

  const filteredSections = sections.filter(
    (s) =>
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeSection = sections.find((s) => s.id === activeTab) || sections[0];

  const handleNavigateToPage = (route?: string) => {
    if (!route) return;
    onClose();
    navigate(route);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none">
      <div className="bg-surface rounded-2xl shadow-2xl border border-border w-full max-w-4xl h-[640px] max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-hover/20 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-text-primary">Niazi Mobile Mart User Guide</h3>
              <p className="text-xs text-text-muted">Official documentation and workflow guidance</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
            aria-label="Close user guide"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="px-6 py-3 border-b border-border bg-surface shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search user guide topics (e.g. POS, Cash, Workforce, Backup)..."
              className="w-full pl-9 pr-4 py-2 bg-surface-hover/40 border border-border rounded-lg text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Modal Body: Two Column */}
        <div className="flex flex-1 min-h-0">
          {/* Left: Navigation Categories */}
          <div className="w-64 border-r border-border p-3 overflow-y-auto space-y-1 custom-scrollbar shrink-0 bg-surface-hover/10">
            {filteredSections.map((sec) => {
              const Icon = sec.icon;
              const isActive = sec.id === activeSection.id;
              return (
                <button
                  key={sec.id}
                  onClick={() => setActiveTab(sec.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium text-left transition-colors ${
                    isActive
                      ? 'bg-primary text-white shadow-xs font-semibold'
                      : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{sec.title}</span>
                  </div>
                  <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition-transform ${isActive ? 'rotate-90' : 'opacity-40'}`} />
                </button>
              );
            })}
          </div>

          {/* Right: Content Panel */}
          <div className="flex-1 p-6 overflow-y-auto custom-scrollbar flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                    {React.createElement(activeSection.icon, { className: 'w-4 h-4' })}
                  </div>
                  <h2 className="text-base font-bold text-text-primary">{activeSection.title}</h2>
                </div>
                {activeSection.route && (
                  <button
                    onClick={() => handleNavigateToPage(activeSection.route)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface border border-border text-xs font-medium text-primary hover:bg-primary/5 transition-colors shadow-xs"
                  >
                    <span>Open Page</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="pt-2">{activeSection.content}</div>
            </div>

            <div className="pt-6 mt-6 border-t border-border flex items-center justify-between text-[11px] text-text-muted shrink-0">
              <span>Niazi Mobile Mart Desktop ERP • Version 1.3.50</span>
              <button
                onClick={onClose}
                className="px-3.5 py-1.5 rounded-lg bg-surface-hover hover:bg-border text-text-secondary font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
