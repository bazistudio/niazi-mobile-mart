import { dashboardApi } from '@/services/dashboard.api';

export interface SalesMetrics {
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  topSellingProductId: string | null;
  periodLabel: string;
}

export type SalesPeriod = 'today' | 'weekly' | 'monthly';

export const salesService = {
  /**
   * Calculates sales metrics for a given period from the canonical backend dashboard API.
   * This service acts as the read-only analytics layer.
   */
  getMetrics: async (period: SalesPeriod): Promise<SalesMetrics> => {
    const res = await dashboardApi.getMetrics();
    if (!res?.success || !res?.data) {
      throw new Error('Failed to retrieve sales metrics from backend');
    }

    const summary = res.data.summary;
    const topProduct = res.data.topProducts?.[0]?.name || null;

    if (period === 'today') {
      const totalRevenue = summary.revenue?.today || 0;
      const totalOrders = summary.orders?.today || 0;
      const averageOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
      return {
        totalRevenue,
        totalOrders,
        averageOrderValue,
        topSellingProductId: topProduct,
        periodLabel: 'Today'
      };
    }

    if (period === 'weekly') {
      const totalRevenue = summary.revenue?.thisMonth ? Math.round(summary.revenue.thisMonth / 4) : summary.revenue?.today || 0;
      const totalOrders = summary.orders?.total ? Math.round(summary.orders.total / 4) : summary.orders?.today || 0;
      const averageOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
      return {
        totalRevenue,
        totalOrders,
        averageOrderValue,
        topSellingProductId: topProduct,
        periodLabel: 'This Week'
      };
    }

    const totalRevenue = summary.revenue?.thisMonth || summary.revenue?.total || 0;
    const totalOrders = summary.orders?.total || 0;
    const averageOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
    return {
      totalRevenue,
      totalOrders,
      averageOrderValue,
      topSellingProductId: topProduct,
      periodLabel: 'This Month'
    };
  }
};
