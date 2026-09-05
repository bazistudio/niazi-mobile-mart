const Order = require('../models/Order');
const Expense = require('../models/Expense');
const LedgerEntry = require('../models/LedgerEntry');
const Customer = require('../models/Customer');
const mongoose = require('mongoose');

exports.getHistory = async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const { search, type, status, limit = 50, page = 1 } = req.query;
    
    // For small-medium businesses, in-memory merge of latest 1000 items is very fast.
    // For enterprise, this would use a dedicated pre-aggregated History collection or $unionWith.
    const fetchLimit = 500; 

    let orders = [];
    let expenses = [];
    let payments = [];

    // Orders
    if (!type || type === 'sale' || type === 'purchase') {
      const query = { organizationId: tenantId, isDeleted: { $ne: true } };
      if (status) query.paymentStatus = status;
      if (search) {
        query.$or = [
          { displayNumber: { $regex: search, $options: 'i' } }
        ];
      }
      
      orders = await Order.find(query)
        .populate({ path: 'partyId', model: 'Customer', select: 'name companyName', match: { organizationId: tenantId } })
        .sort({ createdAt: -1 })
        .limit(fetchLimit)
        .lean();
    }

    // Expenses
    if (!type || type === 'expense') {
      const query = { organizationId: tenantId, status: { $ne: 'deleted' } };
      if (search) {
        query.title = { $regex: search, $options: 'i' };
      }
      expenses = await Expense.find(query)
        .sort({ createdAt: -1 })
        .limit(fetchLimit)
        .lean();
    }

    // Payments
    if (!type || type === 'payment') {
      const query = { organizationId: tenantId, referenceType: 'PAYMENT' };
      // Payment search is harder since we don't have text fields directly on it, skip for now
      payments = await LedgerEntry.find(query)
        .populate({ path: 'partyId', model: 'Customer', select: 'name companyName', match: { organizationId: tenantId } })
        .sort({ createdAt: -1 })
        .limit(fetchLimit)
        .lean();
    }

    // Map to unified frontend interface
    const formattedOrders = orders.map(o => ({
      id: o._id,
      type: o.grandTotal < 0 ? 'refund' : 'sale',
      referenceId: o.displayNumber || o.orderNumber || o._id.toString().substring(0,8),
      party: o.partyId 
        ? { id: o.partyId._id, name: o.partyId.name || o.partyId.companyName || 'Unknown', type: 'customer' } 
        : { id: 'walk-in', name: 'Walk-in Customer', type: 'customer' },
      amount: Math.abs(o.grandTotal || o.totalAmount || 0),
      status: o.paymentStatus || o.status,
      source: 'pos',
      createdAt: o.createdAt
    }));

    const formattedExpenses = expenses.map(e => ({
      id: e._id,
      type: 'expense',
      referenceId: e.title,
      party: { id: 'expense-cat', name: e.category.charAt(0).toUpperCase() + e.category.slice(1), type: 'supplier' },
      amount: e.amount,
      status: e.status,
      source: 'manual',
      createdAt: e.createdAt || e.date
    }));

    const formattedPayments = payments.map(p => ({
      id: p._id,
      type: 'payment',
      referenceId: p.referenceId.toString().substring(0, 8),
      party: p.partyId 
        ? { id: p.partyId._id, name: p.partyId.name || p.partyId.companyName || 'Unknown', type: 'customer' } 
        : { id: 'unknown', name: 'Unknown Account', type: 'customer' },
      amount: p.amount,
      status: 'paid',
      source: 'manual',
      createdAt: p.createdAt
    }));

    let allItems = [...formattedOrders, ...formattedExpenses, ...formattedPayments];
    
    // Sort
    allItems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginated = allItems.slice(skip, skip + parseInt(limit));

    res.json({ data: paginated, total: allItems.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getStats = async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;

    const tenantIdObj = tenantId;

    // Concurrently aggregate orders and expenses
    const [orderStats, expenseStats] = await Promise.all([
      Order.aggregate([
        { $match: { organizationId: tenantIdObj, isDeleted: { $ne: true } } },
        { 
          $group: { 
            _id: null, 
            totalSales: { $sum: "$grandTotal" }, 
            totalInvoices: { $sum: 1 },
            pendingPayments: { $sum: { $cond: [{ $eq: ["$paymentStatus", "pending"] }, "$grandTotal", 0] } }
          } 
        }
      ]),
      Expense.aggregate([
        { $match: { organizationId: tenantIdObj, status: { $ne: 'deleted' } } },
        { $group: { _id: null, totalExpenses: { $sum: "$amount" } } }
      ])
    ]);

    const sales = orderStats[0] ? orderStats[0].totalSales : 0;
    const invoices = orderStats[0] ? orderStats[0].totalInvoices : 0;
    const pending = orderStats[0] ? orderStats[0].pendingPayments : 0;
    const expenses = expenseStats[0] ? expenseStats[0].totalExpenses : 0;

    res.json({
      totalSales: sales,
      totalInvoices: invoices,
      totalExpenses: expenses,
      netRevenue: sales - expenses,
      pendingPayments: pending
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getLedgerTrace = async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const { id } = req.params;

    // Find all ledger entries related to this transaction / reference ID
    const entries = await LedgerEntry.find({
      organizationId: tenantId,
      $or: [
        { referenceId: id },
        { transactionId: id }
      ]
    }).sort({ createdAt: 1 }).lean();

    const trace = entries.map((e, index) => {
      let stepName = 'Ledger Entry';
      if (e.referenceType === 'PAYMENT') stepName = 'Payment Processed';
      if (e.referenceType === 'INVOICE') stepName = 'Invoice Issued';
      if (e.referenceType === 'EXPENSE') stepName = 'Expense Recorded';

      return {
        id: e._id,
        step: stepName,
        description: `${e.type} ${e.amount} to ${e.systemAccountId}`,
        timestamp: e.createdAt,
        amount: e.amount,
        status: 'completed'
      };
    });

    res.json(trace);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
