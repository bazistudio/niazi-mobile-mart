const Expense = require('../models/Expense');
const LedgerEntry = require('../models/LedgerEntry');
const Branch = require('../models/Branch');
const auditService = require('../services/auditService');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { startSession } = require('../db/connection');
const tenantPopulate = require('../utils/tenantPopulate');

exports.createExpense = async (req, res) => {
  const session = await startSession();

  try {
    const { title, amount, category, paymentMethod, note, idempotencyKey } = req.body;
    
    const tenantId = req.user?.tenantId || req.tenantId || req.body.tenantId;
    const shopId = req.user?.shopId || req.shopId || req.body.shopId;
    const userId = req.user?._id || req.user?.id || req.body.userId;

    if (!tenantId || !shopId) {
      throw new Error('Tenant ID and Branch ID are required');
    }

    // 1. Idempotency Protection
    const finalIdempotencyKey = idempotencyKey || crypto.randomUUID();
    const existingExpense = await Expense.findOne({ idempotencyKey: finalIdempotencyKey, shopId, tenantId }).session(session);
    if (existingExpense) {
      throw new Error("Duplicate request");
    }

    // Pre-allocate IDs to link them instantly
    const expenseId = crypto.randomUUID();
    const ledgerId = crypto.randomUUID();
    const transactionIdObj = crypto.randomUUID();

    // 2. Expense (Source event)
    const expense = await Expense.create([{
      _id: expenseId,
      title,
      amount,
      category,
      paymentMethod,
      note,
      tenantId, // Expense uses tenantId
      organizationId: tenantId,
      branchId: shopId,
      shopId,
      createdBy: userId,
      status: 'paid',
      idempotencyKey: finalIdempotencyKey,
      ledgerEntryId: ledgerId
    }], { session });

    const newExpense = expense[0];

    // 3. Ledger Engine (Atomic balance update)
    const balanceAdjustment = paymentMethod === 'cash' ? -amount : 0; 
    let newBalance = 0;

    if (balanceAdjustment !== 0) {
      const updatedShop = await Branch.findOneAndUpdate(
        { _id: shopId, organizationId: tenantId },
        { $inc: { cashBalance: balanceAdjustment } },
        { new: true, session }
      );
      if (updatedShop) {
        newBalance = updatedShop.cashBalance;
      } else {
        console.warn(`Branch ${shopId} not found. Skipping cash balance update (V1 user).`);
        newBalance = 0;
      }
    } else {
      const shop = await Branch.findOne({ _id: shopId, organizationId: tenantId }).select('cashBalance').session(session);
      newBalance = shop ? shop.cashBalance : 0;
    }

    const ledgerEntry = await LedgerEntry.create([{
      _id: ledgerId,
      transactionId: transactionIdObj,
      systemAccountId: paymentMethod === 'cash' ? 'CASH' : 'ACCOUNTS_PAYABLE',
      type: 'CR', // Money is leaving
      amount,
      referenceType: 'EXPENSE',
      referenceId: newExpense._id,
      organizationId: tenantId,
      branchId: shopId,
    }], { session });

    // 4. History Stream (Audit)
    if (auditService && auditService.logAction) {
      await auditService.logAction({
        userId,
        tenantId,
        shopId,
        action: 'CREATE_EXPENSE',
        resource: 'Expense',
        resourceId: newExpense._id,
        changes: {
          before: null,
          after: { title, amount, category, paymentMethod }
        },
        metadata: { ledgerEntryId: ledgerId, idempotencyKey: finalIdempotencyKey },
        ipAddress: req.ip,
        userAgent: req.headers && req.headers['user-agent']
      }, session);
    }

    if (session) await session.commitTransaction();
    res.status(201).json(newExpense);
  } catch (err) {
    if (session) await session.abortTransaction();
    res.status(err.message === "Duplicate request" ? 409 : 500).json({ message: err.message || 'Error creating expense' });
  } finally {
    if (session) session.endSession();
  }
};

exports.getExpenses = async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const shopId = req.user?.shopId || req.shopId;
    const { category, startDate, endDate, search, limit = 50, page = 1, sortBy = 'date', sortOrder = 'desc' } = req.query;

    const query = { organizationId: tenantId, branchId: shopId, status: { $ne: 'deleted' } };

    if (category) query.category = category;
    
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    if (search) {
      query.title = { $regex: search, $options: 'i' };
    }

    const parsedLimit = parseInt(limit);
    const parsedPage = parseInt(page);
    const sortObj = {};
    sortObj[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const expenses = await Expense.find(query)
      .sort(sortObj)
      .skip((parsedPage - 1) * parsedLimit)
      .limit(parsedLimit)
      .populate(tenantPopulate('createdBy', 'name email', tenantId));

    const total = await Expense.countDocuments(query);

    res.json({ data: expenses, total, page: parsedPage, limit: parsedLimit });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateExpense = async (req, res) => {
  const session = await startSession();

  try {
    const { id } = req.params;
    const { title, amount, category, paymentMethod, note } = req.body;
    const tenantId = req.user?.tenantId || req.tenantId;
    const shopId = req.user?.shopId || req.shopId;
    const userId = req.user?._id || req.user?.id;

    const expense = await Expense.findOne({ _id: id, organizationId: tenantId, branchId: shopId }).session(session);
    if (!expense) throw new Error('Expense not found');
    if (expense.status === 'deleted') throw new Error('Cannot edit a deleted expense');

    // 1. Reversal of old Ledger Entry
    const originalLedger = await LedgerEntry.findOne({ _id: expense.ledgerEntryId, organizationId: tenantId }).session(session);
    
    if (originalLedger) {
      // Reverse old cash balance if it was cash
      const oldBalanceAdjustment = expense.paymentMethod === 'cash' ? expense.amount : 0; 
      if (oldBalanceAdjustment !== 0) {
        await Branch.updateOne(
          { _id: shopId, organizationId: tenantId },
          { $inc: { cashBalance: oldBalanceAdjustment } }, // add cash back
          { session }
        );
      }
      
      // In V3, we just create a counter-entry (DR) or delete the original depending on requirements.
      // But since we want to keep audit trail, we insert a reversing DR entry.
      const revTransactionId = crypto.randomUUID();
      await LedgerEntry.create([{
        transactionId: revTransactionId,
        systemAccountId: originalLedger.systemAccountId,
        type: originalLedger.type === 'CR' ? 'DR' : 'CR',
        amount: originalLedger.amount,
        referenceType: 'EXPENSE_REVERSAL',
        referenceId: expense._id,
        organizationId: tenantId,
        branchId: shopId,
      }], { session });

      // No status field in V3 ledger, it's immutable
    }

    // 2. Create NEW Ledger Entry with updated data
    const newBalanceAdjustment = paymentMethod === 'cash' ? -amount : 0;
    let newBalance = 0;
    if (newBalanceAdjustment !== 0) {
      const updatedShop = await Branch.findOneAndUpdate(
        { _id: shopId, organizationId: tenantId },
        { $inc: { cashBalance: newBalanceAdjustment } },
        { new: true, session }
      );
      if (updatedShop) {
        newBalance = updatedShop.cashBalance;
      } else {
        newBalance = 0;
      }
    } else {
      const shop = await Branch.findOne({ _id: shopId, organizationId: tenantId }).select('cashBalance').session(session);
      newBalance = shop ? shop.cashBalance : 0;
    }

    const newTransactionId = crypto.randomUUID();
    const newLedgerId = crypto.randomUUID();

    await LedgerEntry.create([{
      _id: newLedgerId,
      transactionId: newTransactionId,
      systemAccountId: paymentMethod === 'cash' ? 'CASH' : 'ACCOUNTS_PAYABLE',
      type: 'CR',
      amount,
      referenceType: 'EXPENSE',
      referenceId: expense._id,
      organizationId: tenantId,
      branchId: shopId,
    }], { session });

    // 3. Update Expense Document
    expense.title = title;
    expense.amount = amount;
    expense.category = category;
    expense.paymentMethod = paymentMethod;
    expense.note = note;
    expense.ledgerEntryId = newLedgerId;
    await expense.save({ session });

    // 4. Audit Log
    if (auditService && auditService.logAction) {
      await auditService.logAction({
        userId,
        tenantId,
        shopId,
        action: 'UPDATE_EXPENSE',
        resource: 'Expense',
        resourceId: expense._id,
        changes: {
          before: { amount: originalLedger ? originalLedger.amount : null },
          after: { amount }
        },
        metadata: { oldLedgerId: originalLedger ? originalLedger._id : null, newLedgerId },
        ipAddress: req.ip,
        userAgent: req.headers && req.headers['user-agent']
      }, session);
    }

    if (session) await session.commitTransaction();
    res.json(expense);
  } catch (err) {
    if (session) await session.abortTransaction();
    res.status(500).json({ message: err.message });
  } finally {
    if (session) session.endSession();
  }
};

exports.getExpenseTrace = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user?.tenantId || req.tenantId;
    const shopId = req.user?.shopId || req.shopId;

    const expense = await Expense.findOne({ _id: id, organizationId: tenantId, branchId: shopId });
    if (!expense) return res.status(404).json({ message: 'Expense not found' });

    const ledgerEntries = await LedgerEntry.find({ referenceId: id, organizationId: tenantId }).sort({ createdAt: 1 });
    
    let auditLogs = [];
    const AuditLog = require('../models/AuditLog');
    if (AuditLog) {
      auditLogs = await AuditLog.find({ resourceId: id, tenantId: tenantId }).sort({ createdAt: 1 });
    }

    res.json({
      expense,
      ledgerEntries,
      auditLogs,
      cashImpact: ledgerEntries.reduce((acc, entry) => {
        // In V3, DR to CASH means cash came in, CR means cash went out.
        if (entry.systemAccountId === 'CASH') {
          return entry.type === 'DR' ? acc + entry.amount : acc - entry.amount;
        }
        return acc;
      }, 0)
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteExpense = async (req, res) => {
  const session = await startSession();

  try {
    const { id } = req.params;
    const tenantId = req.user?.tenantId || req.tenantId;
    const shopId = req.user?.shopId || req.shopId;
    const userId = req.user?._id || req.user?.id;

    const expense = await Expense.findOne({ _id: id, organizationId: tenantId, branchId: shopId }).session(session);
    if (!expense) throw new Error('Expense not found');
    if (expense.status === 'deleted') throw new Error('Expense already deleted');

    // 1. Soft delete
    expense.status = 'deleted';
    await expense.save({ session });

    // 2. Fetch Original Ledger Entry
    const originalLedger = await LedgerEntry.findOne({ _id: expense.ledgerEntryId, organizationId: tenantId }).session(session);
    if (!originalLedger) {
      console.warn("Original ledger entry not found for reversal");
    }

    // 3. Reverse Ledger Balance
    const balanceAdjustment = expense.paymentMethod === 'cash' ? expense.amount : 0; 
    let newBalance = 0;

    if (balanceAdjustment !== 0) {
      const updatedShop = await Branch.findOneAndUpdate(
        { _id: shopId, organizationId: tenantId },
        { $inc: { cashBalance: balanceAdjustment } },
        { new: true, session }
      );
      if (updatedShop) {
        newBalance = updatedShop.cashBalance;
      } else {
        newBalance = 0;
      }
    } else {
      const shop = await Branch.findOne({ _id: shopId, organizationId: tenantId }).select('cashBalance').session(session);
      newBalance = shop ? shop.cashBalance : 0;
    }

    // 4. Create Ledger Reversal
    if (originalLedger) {
      const revTransactionId = crypto.randomUUID();
      await LedgerEntry.create([{
        transactionId: revTransactionId,
        systemAccountId: originalLedger.systemAccountId,
        type: originalLedger.type === 'CR' ? 'DR' : 'CR',
        amount: originalLedger.amount,
        referenceType: 'EXPENSE_REVERSAL',
        referenceId: expense._id,
        organizationId: tenantId,
        branchId: shopId,
      }], { session });
    }

    // 5. History Entry (Audit)
    if (auditService && auditService.logAction) {
      await auditService.logAction({
        userId,
        tenantId,
        shopId,
        action: 'DELETE_EXPENSE',
        resource: 'Expense',
        resourceId: expense._id,
        changes: {
          before: { status: 'paid' },
          after: { status: 'deleted' }
        },
        ipAddress: req.ip,
        userAgent: req.headers && req.headers['user-agent']
      }, session);
    }

    if (session) await session.commitTransaction();
    res.json({ message: 'Expense deleted successfully' });
  } catch (err) {
    if (session) await session.abortTransaction();
    res.status(500).json({ message: err.message });
  } finally {
    if (session) session.endSession();
  }
};

exports.getStats = async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || req.tenantId;
    const shopId = req.user?.shopId || req.shopId;
    
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // For trend calculation
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    // Single unified aggregation pipeline
    const statsResult = await Expense.aggregate([
      { 
        $match: { 
          organizationId: tenantId, 
          branchId: shopId,
          status: { $ne: 'deleted' }
        } 
      },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                totalExpenses: { $sum: "$amount" },
                monthlyExpenses: {
                  $sum: { $cond: [{ $gte: ["$date", startOfMonth] }, "$amount", 0] }
                },
                prevMonthlyExpenses: {
                  $sum: { $cond: [{ $and: [{ $gte: ["$date", startOfPrevMonth] }, { $lte: ["$date", endOfPrevMonth] }] }, "$amount", 0] }
                },
                pendingAmount: {
                  $sum: { $cond: [{ $eq: ["$status", "pending"] }, "$amount", 0] }
                }
              }
            }
          ],
          breakdown: [
            {
              $group: {
                _id: "$category",
                total: { $sum: "$amount" }
              }
            },
            { $sort: { total: -1 } }
          ]
        }
      }
    ]);

    let totalExpenses = 0;
    let monthlyExpenses = 0;
    let prevMonthlyExpenses = 0;
    let pendingAmount = 0;
    let topCategory = 'other';
    
    const breakdown = { rent: 0, salary: 0, utilities: 0, transport: 0, purchase: 0, repair: 0, other: 0 };
    const breakdownPercentages = {};

    if (statsResult.length > 0) {
      const facet = statsResult[0];
      
      if (facet.totals.length > 0) {
        totalExpenses = facet.totals[0].totalExpenses;
        monthlyExpenses = facet.totals[0].monthlyExpenses;
        prevMonthlyExpenses = facet.totals[0].prevMonthlyExpenses;
        pendingAmount = facet.totals[0].pendingAmount;
      }

      if (facet.breakdown.length > 0) {
        topCategory = facet.breakdown[0]._id || 'other';
        facet.breakdown.forEach(cat => {
          const c = cat._id || 'other';
          if (breakdown[c] !== undefined) {
            breakdown[c] = cat.total;
          } else {
            breakdown.other += cat.total;
          }
        });
        
        // Calculate percentages
        const breakdownTotal = facet.breakdown.reduce((sum, cat) => sum + cat.total, 0);
        Object.keys(breakdown).forEach(key => {
          breakdownPercentages[key] = breakdownTotal > 0 ? ((breakdown[key] / breakdownTotal) * 100).toFixed(1) : 0;
        });
      }
    }

    // Calculate Trend
    let trend = 0;
    if (prevMonthlyExpenses > 0) {
      trend = ((monthlyExpenses - prevMonthlyExpenses) / prevMonthlyExpenses) * 100;
    } else if (monthlyExpenses > 0) {
      trend = 100; // infinite growth if prev month was 0
    }

    res.json({
      totalMonthly: monthlyExpenses,
      prevMonthlyExpenses,
      trend: trend.toFixed(1),
      pendingAmount,
      breakdown,
      breakdownPercentages,
      totalExpenses,
      topCategory
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
