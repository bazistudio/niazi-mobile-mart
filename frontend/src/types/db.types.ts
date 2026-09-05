export interface DBUser {
  id: string;
  name: string;
  role: 'admin' | 'cashier' | 'manager';
}

export interface DBInventory {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  costPrice: number;
  salePrice: number;
  stock: number;
  reservedStock: number;
  lastUpdated: number;
}

export interface DBLedgerEntry {
  id: string;
  transactionId: string;
  type: string;
  debitAccount: 'cash' | 'receivable' | 'inventory' | 'cogs' | 'sales_revenue' | 'expense' | 'payable';
  creditAccount: 'cash' | 'receivable' | 'inventory' | 'sales_revenue' | 'cogs' | 'payable';
  amount: number;
  timestamp: number;
  customerId?: string;
  supplierId?: string;
  description?: string;
}

export interface DBAuditLog {
  id: string;
  entityType: 'transaction' | 'inventory' | 'ledger' | 'user';
  action: 'SALE' | 'REFUND' | 'VOID' | 'STOCK_ADJUST' | 'LOGIN' | 'REPLACE' | 'PAYMENT' | 'IMPORT_INVOICE' | 'IMPORT_PURCHASE';
  beforeState: any;
  afterState: any;
  user: string;
  timestamp: number;
}

export interface DBTransaction {
  transactionId: string;
  transactionType: 'sale' | 'replace_exchange' | 'return_only';
  status: 'pending' | 'completed' | 'void' | 'refunded' | 'locked';
  
  items: any[];
  returnedItems: any[];
  
  subtotal: number;
  discountTotal: number;
  grandTotal: number;
  
  paymentBreakdown: { method: string; amount: number }[];
  totalPaid: number;
  remainingDue: number;
  paymentStatus: 'PAID' | 'PARTIAL' | 'DUE';
  changeReturned: number;
  
  customer: { id: string; name: string } | null;
  
  createdAt: number;
  
  lockedAt?: number;
  hash?: string;
  version?: number;
  previousHash?: string;
}

export interface DBReconciliation {
  id: string;
  transactionId: string;
  totalAmount: number;
  totalDiscount: number;
  finalAmount: number;
  totalPaid: number;
  remainingDue: number;
  paymentStatus: 'PAID' | 'PARTIAL' | 'DUE';
  paymentBreakdown: { method: string; amount: number }[];
  timestamp: number;
}

export interface DBCustomer {
  id: string;
  _id?: string; // Mongoose ID
  accountCode: string;
  name: string;
  mobile: string;
  phone?: string; // Match phone/mobile key difference
  currentBalance: number;
  creditLimit: number;
  createdAt?: number;
}

export interface DBSupplier {
  id: string;
  name: string;
  mobile?: string;
  currentBalance: number;
  createdAt: number;
}

export interface DBInvoicePrintLog {
  id: string;
  invoiceId: string;
  transactionId: string;
  action: 'PRINT' | 'PDF' | 'REPRINT';
  timestamp: number;
}
