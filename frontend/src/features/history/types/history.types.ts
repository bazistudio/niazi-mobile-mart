export type HistoryItem = {
  id: string;
  type: "sale" | "purchase" | "payment" | "expense" | "import" | "stock_adjustment";
  referenceId: string;

  party: {
    id: string;
    name: string;
    type: "customer" | "supplier" | null;
  };

  amount: number;
  status: "paid" | "pending" | "partial";

  source: "pos" | "manual" | "import" | "whatsapp";

  createdAt: string;
};

export type HistoryStats = {
  totalSales: number;
  totalInvoices: number;
  totalExpenses: number;
  netRevenue: number;
  pendingPayments: number;
};

export type HistoryFilterParams = {
  page: number;
  limit: number;
  type?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  search?: string;
};

export type LedgerTraceItem = {
  id: string;
  step: "Invoice Created" | "Stock Movement" | "Ledger Entry" | "Payment";
  description: string;
  timestamp: string;
  amount?: number;
  status?: string;
};
