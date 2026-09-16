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
  },

  getHourlyBreakdown: async (_params?: { date?: string }): Promise<{ success: boolean; data: HourlyBreakdownData }> => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const sales = await tauriClient.saleList({ start_date: todayStr, end_date: todayStr, limit: 500 }).catch(() => []);

    const hourlyMap: Record<number, { sales: number; count: number }> = {};
    for (let i = 0; i < 24; i++) {
      hourlyMap[i] = { sales: 0, count: 0 };
    }

    for (const s of sales) {
      if (s.sale_status === 'COMPLETED' && (s.created_at || '').startsWith(todayStr)) {
        const d = new Date(s.created_at);
        const hour = d.getHours();
        if (hourlyMap[hour]) {
          hourlyMap[hour].sales += s.total_amount || 0;
          hourlyMap[hour].count += 1;
        }
      }
    }

    const hourlySales: HourlySalesData[] = Array.from({ length: 24 }, (_, i) => ({
      hour: `${i.toString().padStart(2, '0')}:00`,
      sales: hourlyMap[i].sales,
      ordersCount: hourlyMap[i].count,
    }));

    return {
      success: true,
      data: {
        hourlySales,
        categorySales: [],
        topProduct: null,
      },
    };
  },
};
