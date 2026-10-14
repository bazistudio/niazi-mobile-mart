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
      // P1 fix: use actual week-to-date revenue and order count from backend
      // (Monday 00:00 PKT through now). Do NOT fall back to dividing monthly
      // totals — show 0 if the backend did not return weekly data.
      const totalRevenue = summary.revenue?.thisWeek ?? 0;
      const totalOrders = summary.orders?.thisWeek ?? 0;
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
