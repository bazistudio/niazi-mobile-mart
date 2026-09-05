const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Customer = require('../models/Customer');

/**
 * Get dashboard KPIs including Revenue, Profit, and Growth
 */
exports.getDashboardMetrics = async (tenantId, branchId = null) => {
  const now = new Date();
  
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(today.getUTCDate() - 1);

  const startOfMonth = new Date(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const startOfLastMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getUTCFullYear(), now.getUTCMonth(), 0);

  // 1. Core Metrics & Top Products Aggregation
  // First, we unwind items and lookup product prices to calculate order-level revenue and profit.
  // Then we use a single $facet stage to branch into date KPIs (pre-grouped by order ID) and top products.
  const orderMatch = { organizationId: tenantId, status: { $ne: 'Cancelled' } };
  if (branchId) {
    orderMatch.branchId = branchId;
  }

  // 3. Inventory and Customer Filters
  const productFilter = { organizationId: tenantId, isDeleted: { $ne: true }, status: { $in: ['ACTIVE', 'active'] } };
  if (branchId) {
    productFilter.$or = [{ branchId }, { branchId: { $exists: false } }, { branchId: null }];
  }

  const customerFilter = { organizationId: tenantId, isDeleted: { $ne: true }, status: { $in: ['ACTIVE', 'active'] } };
  if (branchId) {
    customerFilter.$or = [{ branchId }, { branchId: { $exists: false } }, { branchId: null }];
  }

  const refundMatch = { organizationId: tenantId, status: 'Cancelled' };
  if (branchId) {
    refundMatch.branchId = branchId;
  }

  // 4. Parallel Execution of All Independent Database Queries
  const [
    metrics,
    lowStockCount,
    totalProducts,
    totalCustomers,
    outstandingReceivablesResult,
    refundsResult
  ] = await Promise.all([
    Order.aggregate([
      { $match: orderMatch },
      { $unwind: "$items" },
      // Removed unnecessary product lookup as we can just use items.productName and items.productId
      {
        $addFields: {
          itemCost: { 
            $multiply: [
              { $ifNull: ["$items.purchasePrice", 0] },
              "$items.quantity"
            ]
          },
          itemRevenue: {
            $subtract: [
              { $multiply: ["$items.salePrice", "$items.quantity"] },
              { $ifNull: ["$items.discount", 0] }
            ]
          }
        }
      },
      {
        $facet: {
          today: [
            { $match: { createdAt: { $gte: today } } },
            {
              $group: {
                _id: "$_id",
                orderRevenue: { $first: "$grandTotal" },
                orderCost: { $sum: "$itemCost" }
              }
            },
            { $group: { _id: null, revenue: { $sum: "$orderRevenue" }, profit: { $sum: { $subtract: ["$orderRevenue", "$orderCost"] } }, count: { $sum: { $cond: [{ $gt: ["$orderRevenue", 0] }, 1, { $cond: [{ $lt: ["$orderRevenue", 0] }, -1, 0] }] } } } }
          ],
          yesterday: [
            { $match: { createdAt: { $gte: yesterday, $lt: today } } },
            {
              $group: {
                _id: "$_id",
                orderRevenue: { $first: "$grandTotal" },
                orderCost: { $sum: "$itemCost" }
              }
            },
            { $group: { _id: null, revenue: { $sum: "$orderRevenue" }, profit: { $sum: { $subtract: ["$orderRevenue", "$orderCost"] } }, count: { $sum: { $cond: [{ $gt: ["$orderRevenue", 0] }, 1, { $cond: [{ $lt: ["$orderRevenue", 0] }, -1, 0] }] } } } }
          ],
          thisMonth: [
            { $match: { createdAt: { $gte: startOfMonth } } },
            {
              $group: {
                _id: "$_id",
                orderRevenue: { $first: "$grandTotal" },
                orderCost: { $sum: "$itemCost" }
              }
            },
            { $group: { _id: null, revenue: { $sum: "$orderRevenue" }, profit: { $sum: { $subtract: ["$orderRevenue", "$orderCost"] } }, count: { $sum: { $cond: [{ $gt: ["$orderRevenue", 0] }, 1, { $cond: [{ $lt: ["$orderRevenue", 0] }, -1, 0] }] } } } }
          ],
          lastMonth: [
            { $match: { createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth } } },
            {
              $group: {
                _id: "$_id",
                orderRevenue: { $first: "$grandTotal" },
                orderCost: { $sum: "$itemCost" }
              }
            },
            { $group: { _id: null, revenue: { $sum: "$orderRevenue" }, profit: { $sum: { $subtract: ["$orderRevenue", "$orderCost"] } }, count: { $sum: { $cond: [{ $gt: ["$orderRevenue", 0] }, 1, { $cond: [{ $lt: ["$orderRevenue", 0] }, -1, 0] }] } } } }
          ],
          total: [
            {
              $group: {
                _id: "$_id",
                orderRevenue: { $first: "$grandTotal" },
                orderCost: { $sum: "$itemCost" }
              }
            },
            { $group: { _id: null, revenue: { $sum: "$orderRevenue" }, profit: { $sum: { $subtract: ["$orderRevenue", "$orderCost"] } }, ordersCount: { $sum: { $cond: [{ $gt: ["$orderRevenue", 0] }, 1, { $cond: [{ $lt: ["$orderRevenue", 0] }, -1, 0] }] } } } }
          ],
          topProducts: [
            {
              $group: {
                _id: "$items.productId",
                name: { $first: "$items.productName" },
                revenue: { $sum: "$itemRevenue" },
                profit: { $sum: { $subtract: ["$itemRevenue", "$itemCost"] } },
                sold: { $sum: "$items.quantity" }
              }
            },
            { $sort: { profit: -1 } },
            { $limit: 5 }
          ]
        }
      }
    ]).option({ skipTenantGuard: true }),
    Product.countDocuments({ ...productFilter, $expr: { $lte: ["$currentStock", "$minStock"] } }),
    Product.countDocuments(productFilter),
    Customer.countDocuments(customerFilter),
    Customer.aggregate([
      { $match: { ...customerFilter, currentBalance: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: "$currentBalance" } } }
    ]).option({ skipTenantGuard: true }),
    Order.aggregate([
      { $match: refundMatch },
      { $group: { _id: null, total: { $sum: "$grandTotal" } } }
    ]).option({ skipTenantGuard: true })
  ]);

  // Crash-proof defaulting if metrics aggregation returns empty/undefined
  const m = metrics?.[0] || { today: [], yesterday: [], thisMonth: [], lastMonth: [], total: [], topProducts: [] };
  const todayStats = m.today?.[0] || { revenue: 0, profit: 0, count: 0 };
  const yesterdayStats = m.yesterday?.[0] || { revenue: 0, profit: 0 };
  const thisMonthStats = m.thisMonth?.[0] || { revenue: 0, profit: 0 };
  const lastMonthStats = m.lastMonth?.[0] || { revenue: 0, profit: 0 };
  const totalStats = m.total?.[0] || { revenue: 0, profit: 0, ordersCount: 0 };
  const topProducts = m.topProducts || [];

  // Growth Calculations (Capped to prevent extreme spikes/mismatch)
  const calculateGrowth = (current, previous) => {
    if (previous === 0) return current > 0 ? 999 : 0;
    const growth = ((current - previous) / previous) * 100;
    return Math.min(Math.max(growth, -999), 999);
  };

  const revenueGrowth = calculateGrowth(thisMonthStats.revenue, lastMonthStats.revenue);
  const pendingPayments = outstandingReceivablesResult[0]?.total || 0;
  const totalRefunds = refundsResult[0]?.total || 0;

  return {
    summary: {
      revenue: {
        today: todayStats.revenue,
        thisMonth: thisMonthStats.revenue,
        total: totalStats.revenue,
        growth: revenueGrowth
      },
      profit: {
        today: todayStats.profit,
        thisMonth: thisMonthStats.profit,
        total: totalStats.profit
      },
      orders: {
        today: todayStats.count,
        total: totalStats.ordersCount
      },
      inventory: {
        totalProducts,
        lowStockItems: lowStockCount
      },
      customers: {
        total: totalCustomers,
        pendingPayments,
        totalRefunds
      }
    },
    topProducts
  };
};

const AuditLog = require('../models/AuditLog');

/**
 * Get sales chart data for the last 30 days
 */
exports.getSalesChartData = async (tenantId, days = 30) => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return await Order.aggregate([
    { $match: { organizationId: tenantId, status: { $ne: 'Cancelled' }, createdAt: { $gte: startDate } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        revenue: { $sum: "$grandTotal" },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]).option({ skipTenantGuard: true });
};

exports.getDashboardSummary = async (tenantId) => {
  const [metrics, stockAlerts, activityFeed] = await Promise.all([
    exports.getDashboardMetrics(tenantId),
    exports.getStockAlerts(tenantId),
    exports.getActivityFeed(tenantId)
  ]);

  return {
    revenue: metrics.summary.revenue,
    sales: {
      totalSales: metrics.summary.revenue.total,
      totalOrders: metrics.summary.orders.total,
      growth: metrics.summary.revenue.growth
    },
    stockAlerts,
    recentActivity: activityFeed
  };
};

/**
 * Get hourly breakdown, category distribution, and top product for today
 */
exports.getHourlyBreakdown = async (tenantId, branchId = null, targetDate = null) => {
  const d = targetDate ? new Date(targetDate) : new Date();
  const startDate = new Date(d);
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(d);
  endDate.setHours(23, 59, 59, 999);

  const orderMatch = {
    organizationId: tenantId,
    status: { $nin: ['Cancelled', 'cancelled', 'Draft', 'draft', 'void'] },
    createdAt: { $gte: startDate, $lte: endDate }
  };

  if (branchId) {
    orderMatch.branchId = branchId;
  }

  const [aggregationResult] = await Order.aggregate([
    { $match: orderMatch },
    {
      $facet: {
        hourly: [
          {
            $group: {
              _id: { $hour: "$createdAt" },
              sales: { $sum: "$grandTotal" },
              ordersCount: { $sum: 1 }
            }
          }
        ],
        categorySales: [
          { $unwind: "$items" },
          {
            $lookup: {
              from: "products",
              localField: "items.productId",
              foreignField: "_id",
              as: "product"
            }
          },
          { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: "categories",
              localField: "product.categoryId",
              foreignField: "_id",
              as: "category"
            }
          },
          { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
          {
            $group: {
              _id: { $ifNull: ["$category.name", "General"] },
              salesAmount: { 
                $sum: { 
                  $ifNull: [
                    "$items.total", 
                    { $multiply: [{ $ifNull: ["$items.salePrice", 0] }, { $ifNull: ["$items.quantity", 1] }] }
                  ] 
                } 
              },
              itemsSold: { $sum: { $ifNull: ["$items.quantity", 1] } }
            }
          },
          { $sort: { salesAmount: -1 } }
        ],
        topProduct: [
          { $unwind: "$items" },
          {
            $group: {
              _id: { $ifNull: ["$items.productId", "$items.productName"] },
              name: { $first: "$items.productName" },
              quantitySold: { $sum: { $ifNull: ["$items.quantity", 1] } },
              revenue: { 
                $sum: { 
                  $ifNull: [
                    "$items.total", 
                    { $multiply: [{ $ifNull: ["$items.salePrice", 0] }, { $ifNull: ["$items.quantity", 1] }] }
                  ] 
                } 
              }
            }
          },
          { $sort: { quantitySold: -1, revenue: -1 } },
          { $limit: 1 }
        ]
      }
    }
  ]).option({ skipTenantGuard: true });

  // 1. Build 24-hour buckets (00:00 to 23:00)
  const hourlyMap = new Map();
  (aggregationResult?.hourly || []).forEach((h) => {
    hourlyMap.set(h._id, h);
  });

  const hourlySales = Array.from({ length: 24 }, (_, i) => {
    const bucket = hourlyMap.get(i);
    return {
      hour: `${i.toString().padStart(2, '0')}:00`,
      sales: bucket ? bucket.sales : 0,
      ordersCount: bucket ? bucket.ordersCount : 0
    };
  });

  // 2. Build category distribution with percentage
  const rawCategories = aggregationResult?.categorySales || [];
  const totalCategorySales = rawCategories.reduce((acc, cur) => acc + cur.salesAmount, 0);

  const categorySales = rawCategories.map((cat) => ({
    categoryName: cat._id,
    salesAmount: cat.salesAmount,
    itemsSold: cat.itemsSold,
    percentage: totalCategorySales > 0 ? (cat.salesAmount / totalCategorySales) * 100 : 0
  }));

  // 3. Top product
  const topProductRaw = aggregationResult?.topProduct?.[0] || null;
  const topProduct = topProductRaw
    ? {
        name: topProductRaw.name || 'Product',
        quantitySold: topProductRaw.quantitySold || 0,
        revenue: topProductRaw.revenue || 0
      }
    : null;

  return {
    hourlySales,
    categorySales,
    topProduct
  };
};


exports.getRevenueStats = async (tenantId) => {
  const metrics = await exports.getDashboardMetrics(tenantId);
  return metrics.summary.revenue;
};

exports.getSalesStats = async (tenantId) => {
  const metrics = await exports.getDashboardMetrics(tenantId);
  return {
    totalSales: metrics.summary.revenue.total,
    totalOrders: metrics.summary.orders.total,
    growth: metrics.summary.revenue.growth
  };
};

exports.getOrdersStats = async (tenantId) => {
  const metrics = await exports.getDashboardMetrics(tenantId);
  return metrics.summary.orders;
};

exports.getStockAlerts = async (tenantId) => {
  const lowStockProducts = await Product.find({ 
    tenantId, 
    isLowStock: true, 
    status: 'active' 
  }).limit(10);

  return lowStockProducts.map(p => ({
    productId: p._id,
    productName: p.name,
    currentStock: p.quantity,
    minimumStock: p.lowStockThreshold
  }));
};

exports.getActivityFeed = async (tenantId) => {
  const logs = await AuditLog.find({ tenantId })
    .sort({ createdAt: -1 })
    .limit(10);

  return logs.map(log => ({
    id: log._id,
    type: mapActionToActivityType(log.action),
    message: log.action,
    createdAt: log.createdAt
  }));
};

function mapActionToActivityType(action) {
  if (action.includes('SALE')) return 'SALE_CREATED';
  if (action.includes('STOCK')) return 'STOCK_UPDATED';
  if (action.includes('LOGIN')) return 'USER_LOGIN';
  return 'SYSTEM_ERROR';
}
