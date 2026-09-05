export type TransactionSourceType =
  | 'sale'
  | 'purchase'
  | 'expense'
  | 'customer_payment'
  | 'supplier_payment'
  | 'cash_adjustment'
  | 'stock_adjustment'
  | 'refund';

export type TransactionStatus = 'paid' | 'unpaid' | 'partial' | 'pending' | 'completed';

export interface LineItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  total: number;
}

export interface LedgerTransaction {
  id: string; // The Ref# (e.g., INV-1001)
  date: string;
  partyName: string; // Customer or Supplier Name
  partyPhone?: string;
  type: string; // Display Type (e.g., "Sale", "Payment")
  sourceType: TransactionSourceType;
  debit: number | null; // Null if no debit
  credit: number | null; // Null if no credit
  balance: number; // Running balance
  status: TransactionStatus;
  
  // Detail fields
  items?: LineItem[];
  subtotal?: number;
  paidAmount?: number;
  remainingAmount?: number;
  notes?: string;
}

export interface LedgerSummary {
  totalReceivable: number;
  totalPayable: number;
  cashIn: number;
  cashOut: number;
}

export interface LedgerQuickStats {
  todaySales: number;
  todayExpenses: number;
  pendingReceivable: number;
  pendingPayable: number;
}

export type LedgerTab = 'all' | 'receivables' | 'payables' | 'cash' | 'bank';
