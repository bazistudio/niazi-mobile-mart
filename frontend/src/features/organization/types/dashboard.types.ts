export interface DashboardData {
  organization: {
    name: string;
    code: string;
    owner: string;
  };
  subscription: {
    package: string;
    status: string;
    remainingDays: number;
    expiryDate: string;
  } | null;
  shops: {
    current: number;
    limit: number | 'Unlimited';
  };
  employees: {
    total: number;
  };
  sales: {
    today: number;
    month: number;
    total: number;
  };
  inventory: {
    lowStockProducts: number;
  };
  balances: {
    customer_receivables: number;
    supplier_payables: number;
  };
  recentActivity: Array<{
    action: string;
    details: string;
    date: string;
  }>;
}
