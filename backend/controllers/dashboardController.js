const dashboardService = require('../services/dashboardService');

/**
 * @desc    Get dashboard metrics
 * @route   GET /api/dashboard/metrics
 * @access  Private
 */
exports.getMetrics = async (req, res) => {
  try {
    const tenantId = req.tenantId || req.organizationId;
    const isOrgAdminOrOwner = req.user && (req.user.role === 'SUPER_ADMIN' || req.user.role === 'OWNER' || req.user.role === 'ADMIN' || req.user.isSystemOwner);
    
    let branchId = null;
    if (!isOrgAdminOrOwner) {
      // Non-org admins are strictly scoped to their assigned branch
      branchId = req.user?.branchId || req.branchId || null;
    } else {
      // Org Admins/Owners: check requested context signal and validate authorization against database
      const requestedShop = req.headers['x-shop-id'] || req.query?.shopId || req.query?.branchId;
      if (requestedShop && requestedShop !== 'all' && requestedShop !== req.organizationId) {
        const Branch = require('../models/Branch');
        const validBranch = await Branch.findOne({ _id: requestedShop, organizationId: req.organizationId, isDeleted: false }).lean();
        if (validBranch) {
          branchId = requestedShop;
        }
      } else if (req.user?.branchId && req.user.branchId !== req.organizationId) {
        branchId = req.user.branchId;
      }
    }

    const metrics = await dashboardService.getDashboardMetrics(tenantId, branchId);
    
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get sales chart data
 * @route   GET /api/dashboard/sales-chart
 * @access  Private
 */
exports.getSalesChart = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const days = parseInt(req.query.days) || 30;
    const data = await dashboardService.getSalesChartData(tenantId, days);
    
    res.json({
      success: true,
      data
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getSummary = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const summary = await dashboardService.getDashboardSummary(tenantId);
    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getRevenue = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const data = await dashboardService.getRevenueStats(tenantId);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getSales = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const data = await dashboardService.getSalesStats(tenantId);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getOrders = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const data = await dashboardService.getOrdersStats(tenantId);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getStockAlerts = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const data = await dashboardService.getStockAlerts(tenantId);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getActivityFeed = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const data = await dashboardService.getActivityFeed(tenantId);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get hourly sales breakdown, category distribution, and top product for today
 * @route   GET /api/v1/dashboard/hourly-breakdown
 * @access  Private
 */
exports.getHourlyBreakdown = async (req, res) => {
  try {
    const tenantId = req.tenantId || req.organizationId;
    const isOrgAdminOrOwner = req.user && (req.user.role === 'SUPER_ADMIN' || req.user.role === 'OWNER' || req.user.role === 'ADMIN' || req.user.isSystemOwner);
    
    let branchId = null;
    if (!isOrgAdminOrOwner) {
      // Non-org admins are strictly scoped to their assigned branch
      branchId = req.user?.branchId || req.branchId || null;
    } else {
      // Org Admins/Owners: check requested context signal and validate authorization against database
      const requestedShop = req.headers['x-shop-id'] || req.query?.shopId || req.query?.branchId;
      if (requestedShop && requestedShop !== 'all' && requestedShop !== req.organizationId) {
        const Branch = require('../models/Branch');
        const validBranch = await Branch.findOne({ _id: requestedShop, organizationId: req.organizationId, isDeleted: false }).lean();
        if (validBranch) {
          branchId = requestedShop;
        }
      } else if (req.user?.branchId && req.user.branchId !== req.organizationId) {
        branchId = req.user.branchId;
      }
    }

    const data = await dashboardService.getHourlyBreakdown(tenantId, branchId, req.query?.date);
    
    res.json({
      success: true,
      data
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

