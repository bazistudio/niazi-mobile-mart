import axiosInstance from '@/lib/api/axios';

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
  getMetrics: async () => {
    const response = await axiosInstance.get<{
      success: boolean;
      data: DashboardMetrics;
    }>('/api/v1/dashboard/metrics');
    return response.data;
  },
  getHourlyBreakdown: async (params?: { date?: string }) => {
    const response = await axiosInstance.get<{
      success: boolean;
      data: HourlyBreakdownData;
    }>('/api/v1/dashboard/hourly-breakdown', { params });
    return response.data;
  }
};

