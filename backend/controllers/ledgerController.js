const ledgerService = require('../services/ledgerService');

/**
 * @desc    Record customer payment
 * @route   POST /api/ledger/payment
 * @access  Private
 */
exports.recordPayment = async (req, res) => {
  try {
    const { partyId, partyType, amount, method, notes, idempotencyKey } = req.body;
    const tenantId = req.tenantId;
    const shopId = req.user.shopId;
    const userId = req.user._id;

    if (!partyId || !partyType || amount === undefined || !method) {
      return res.status(400).json({
        success: false,
        message: 'partyId, partyType, amount, and method are required',
      });
    }

    const result = await ledgerService.receiveUnifiedPayment({
      tenantId,
      shopId,
      userId,
      partyId,
      partyType,
      amount,
      method,
      notes,
      idempotencyKey,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    return res.status(200).json({
      success: true,
      data: {
        paymentId: result.paymentId,
        newBalance: result.newBalance
      },
      message: 'Payment recorded successfully'
    });
  } catch (error) {
    console.error('Ledger Payment Error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error recording payment',
    });
  }
};

/**
 * @desc    Record cash payout to customer or supplier
 * @route   POST /api/ledger/payout
 * @access  Private
 */
exports.recordPayout = async (req, res) => {
  try {
    const { partyId, partyType, amount, notes, idempotencyKey } = req.body;
    const tenantId = req.tenantId;
    const shopId = req.user.shopId;
    const userId = req.user._id;

    if (!partyId || !partyType || amount === undefined) {
      return res.status(400).json({
        success: false,
        message: 'partyId, partyType, and amount are required',
      });
    }

    const result = await ledgerService.recordPayout({
      tenantId,
      shopId,
      userId,
      partyId,
      partyType,
      amount,
      notes,
      idempotencyKey,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    return res.status(200).json({
      success: true,
      data: {
        paymentId: result.paymentId,
        newBalance: result.newBalance,
        shopCashBalance: result.shopCashBalance
      },
      message: 'Payout recorded successfully'
    });
  } catch (error) {
    console.error('Ledger Payout Error:', error);
    if (error.message === 'Insufficient Cash in Drawer') {
      return res.status(400).json({ success: false, message: error.message });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error recording payout',
    });
  }
};

/**
 * @desc    Get customer ledger history
 * @route   GET /api/ledger/:customerId
 * @access  Private
 */
exports.getPartyLedger = async (req, res) => {
  try {
    const { partyId } = req.params;
    const { partyType } = req.query; // 'CUSTOMER' or 'SUPPLIER'
    const tenantId = req.tenantId;

    if (!partyId || !partyType) {
      return res.status(400).json({
        success: false,
        message: 'partyId and partyType are required',
      });
    }

    const partyField = partyType === 'CUSTOMER' ? 'customerId' : 'supplierId';
    
    // 1. Fetch Timeline (V3 Ledger uses partyId and organizationId)
    const LedgerEntry = require('../models/LedgerEntry');
    const ledgerHistoryRaw = await LedgerEntry.find({ partyId, organizationId: tenantId }).sort({ createdAt: 1 });
    
    let currentBalance = 0;
    const ledgerHistoryWithBalance = ledgerHistoryRaw.map(entry => {
      if (partyType === 'CUSTOMER') {
        if (entry.type === 'DR') currentBalance += entry.amount;
        else if (entry.type === 'CR') currentBalance -= entry.amount;
      } else {
        if (entry.type === 'CR') currentBalance += entry.amount;
        else if (entry.type === 'DR') currentBalance -= entry.amount;
      }
      return {
        ...entry.toObject(),
        runningBalance: currentBalance
      };
    });

    const ledgerHistory = ledgerHistoryWithBalance.reverse();

    // 2. Fetch Allocations (V2 format fallback)
    const PaymentAllocation = require('../models/PaymentAllocation');
    const allocations = await PaymentAllocation.find({ [partyField]: partyId, tenantId }).sort({ createdAt: -1 });

    // 3. Fetch Open Invoices (V3 Order uses partyId and organizationId)
    const Order = require('../models/Order');
    const openInvoices = await Order.find({ 
      partyId: partyId, 
      organizationId: tenantId, 
      paymentStatus: { $in: ['pending', 'partially_paid'] } 
    }).sort({ createdAt: 1 });

    // 4. Fetch Items for Timeline Invoices
    let itemsMap = {};
    if (partyType === 'CUSTOMER') {
      const orders = await Order.find({ partyId: partyId, organizationId: tenantId })
        .populate({ path: 'items.productId', select: 'name', match: { organizationId: tenantId } })
        .select('displayNumber orderNumber items');
      orders.forEach(o => { itemsMap[o.orderNumber] = o.items; if(o.displayNumber) itemsMap[o.displayNumber] = o.items; itemsMap[o._id.toString()] = o.items; });
    } else {
      // Purchase model is not yet implemented. For now, leave itemsMap empty for suppliers
      // or derive it from elsewhere if needed in the future.
    }

    // 5. Format Timeline
    const formattedHistory = ledgerHistory.map(entry => ({
      id: entry._id,
      transactionId: entry.referenceId || entry.transactionId,
      type: entry.type === 'DR' ? 'sale' : 'payment', // Map V3 type back to frontend expected type
      amount: entry.amount,
      runningBalance: entry.runningBalance || 0, // In V3 we may need to compute this client-side if missing
      timestamp: new Date(entry.createdAt).getTime(),
      description: entry.description || (entry.type === 'DR' ? 'Credit Sale' : 'Payment Received'),
      debitAccount: entry.debitAccount || entry.systemAccountId,
      creditAccount: entry.creditAccount || 'System',
      items: itemsMap[entry.referenceId ? entry.referenceId.toString() : entry.transactionId] || null
    }));

    return res.status(200).json({
      success: true,
      data: {
        timeline: formattedHistory,
        allocations,
        openInvoices
      },
      message: 'Ledger fetched successfully'
    });
  } catch (error) {
    console.error('Fetch Ledger History Error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error fetching ledger history',
    });
  }
};
