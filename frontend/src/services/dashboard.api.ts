import { isTauriEnvironment, tauriClient } from '@/lib/tauri/tauriClient';

export interface DashboardMetrics {
  summary: {
    revenue: {
      today: number;
      thisMonth: number;
      total: number;
      growth: number;
    };
    profit: {
      today: number;
      thisMonth: number;
      total: number;
    };
    orders: {
      today: number;
      total: number;
    };
    inventory: {
      totalProducts: number;
      lowStockItems: number;
    };
    customers: {
      total: number;
      pendingPayments: number;
      totalRefunds: number;
    };
  };
  topProducts: any[];
}

export interface HourlySalesData {
  hour: string;
  sales: number;
  ordersCount: number;
}

export interface CategorySalesData {
  categoryName: string;
  salesAmount: number;
  itemsSold: number;
  percentage: number;
}

export interface TopProductData {
  name: string;
  quantitySold: number;
  revenue: number;
}

export interface HourlyBreakdownData {
  hourlySales: HourlySalesData[];
  categorySales: CategorySalesData[];
  topProduct: TopProductData | null;
}

export const dashboardApi = {
  getMetrics: async (): Promise<{ success: boolean; data: DashboardMetrics }> => {
    if (isTauriEnvironment()) {
      const stats = await tauriClient.organizationGetDashboardStats();
      const profitSummary = await tauriClient.profitGetDashboardSummary();
      return {
        success: true,
        data: {
          summary: {
            revenue: {
              today: profitSummary.today.net_revenue,
              thisMonth: profitSummary.this_month.net_revenue,
              total: profitSummary.total.net_revenue,
              growth: 0,
            },
            profit: {
              today: profitSummary.today.gross_profit,
              thisMonth: profitSummary.this_month.gross_profit,
              total: profitSummary.total.gross_profit,
            },
            orders: {
              today: profitSummary.today.orders_count,
              total: profitSummary.total.orders_count,
            },
            inventory: {
              totalProducts: stats.product_count,
              lowStockItems: stats.low_stock_count,
            },
            customers: {
              total: 0,
              pendingPayments: 0,
              totalRefunds: 0,
            },
          },
          topProducts: [],
        },
      };
    }

    return {
      success: true,
      data: {
        summary: {
          revenue: { today: 0, thisMonth: 0, total: 0, growth: 0 },
          profit: { today: 0, thisMonth: 0, total: 0 },
          orders: { today: 0, total: 0 },
          inventory: { totalProducts: 0, lowStockItems: 0 },
          customers: { total: 0, pendingPayments: 0, totalRefunds: 0 },
        },
        topProducts: [],
      },
    };
  },

  getHourlyBreakdown: async (_params?: { date?: string }): Promise<{ success: boolean; data: HourlyBreakdownData }> => {
    return {
      success: true,
      data: {
        hourlySales: [],
        categorySales: [],
        topProduct: null,
      },
    };
  },
};
