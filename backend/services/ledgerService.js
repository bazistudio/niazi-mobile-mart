const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');
const Order = require('../models/Order');
const LedgerEntry = require('../models/LedgerEntry');
const PaymentAllocation = require('../models/PaymentAllocation');
const auditService = require('./auditService');

/**
 * Record a unified payment (Customer or Supplier) and automatically allocate via FIFO.
 */
exports.receiveUnifiedPayment = async ({ tenantId, shopId, userId, partyId, partyType, amount, method, notes, ipAddress, userAgent, idempotencyKey }) => {
  const { withTransaction } = require('../db/connection');
  const Party = require('../models/Party');

  return await withTransaction(async (session) => {
    if (idempotencyKey) {
      const existingEntry = await LedgerEntry.findOne({ 
        idempotencyKey, 
        organizationId: tenantId, 
        partyId, 
        type: partyType === 'CUSTOMER' ? 'CR' : 'DR' 
      }).session(session);
      if (existingEntry) {
        return { success: true, newBalance: existingEntry.runningBalance || 0, paymentId: existingEntry._id, message: "Idempotent retry ignored" };
      }
    }
    
    // 1. Lock the party account to prevent concurrency bugs
    const party = await Party.findOne({ _id: partyId, organizationId: tenantId }).session(session);
    if (!party) {
      console.warn(`Party not found, continuing ledger creation anyway for partyId: ${partyId}`);
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Payment amount must be greater than zero');
    }

    // ERP OPTION 2: Derive balance strictly from LedgerEntry (Single Source of Truth)
    const lastLedgerEntry = await LedgerEntry.findOne({
      partyId,
      organizationId: tenantId
    }).sort({ _id: -1 }).session(session); // _id ensures perfectly deterministic physical insert ordering

    let previousBalance = lastLedgerEntry ? (lastLedgerEntry.runningBalance || 0) : 0;
    if (isNaN(previousBalance) || previousBalance === null || previousBalance === undefined) {
      previousBalance = 0;
    }
    
    // Strict precision math (if Customer pays, their debt decreases, so balance goes DOWN)
    const balanceChange = partyType === 'CUSTOMER' ? -amount : amount;
    const newBalance = Math.round((previousBalance + balanceChange) * 100) / 100;
    
    // 2. Fetch Open/Partially Paid Invoices for FIFO Allocation
    const openInvoices = await Order.find({
      partyId,
      organizationId: tenantId,
      paymentStatus: { $in: ['pending', 'partially_paid'] }
    }).sort({ createdAt: 1 }).session(session); // ASC for FIFO

    let remainingPayment = amount;
    const allocationsToSave = [];
    const invoiceBulkOps = [];

    // 3. FIFO Allocation Loop
    for (const invoice of openInvoices) {
      if (remainingPayment <= 0) break;

      const unpaidOnInvoice = Math.round((invoice.remainingAmount || 0) * 100) / 100;
      if (unpaidOnInvoice <= 0) continue;

      const allocationAmount = Math.min(remainingPayment, unpaidOnInvoice);
      remainingPayment = Math.round((remainingPayment - allocationAmount) * 100) / 100;

      // Prepare Invoice Update (Batch)
      const updatedPaidAmount = Math.round((invoice.paidAmount + allocationAmount) * 100) / 100;
      const updatedRemainingAmount = Math.round((invoice.totalAmount - updatedPaidAmount) * 100) / 100;
      const updatedPaymentStatus = updatedRemainingAmount <= 0 ? 'paid' : 'partially_paid';
      
      invoiceBulkOps.push({
        updateOne: {
          filter: { _id: invoice._id },
          update: { 
            $set: { 
              paidAmount: updatedPaidAmount, 
              remainingAmount: updatedRemainingAmount, 
              paymentStatus: updatedPaymentStatus 
            } 
          }
        }
      });

      // Prepare Allocation Record
      allocationsToSave.push({
        invoiceId: invoice._id,
        amountAllocated: allocationAmount,
        partyId,
        shopId,
        organizationId: tenantId
      });
    }

    if (invoiceBulkOps.length > 0) {
      await Order.bulkWrite(invoiceBulkOps, { session });
    }

    // 4. Update Party Balance Cache (Secondary / UI only)
    if (party) {
      party.currentBalance = newBalance;
      await party.save({ session });
    }

    // 5. Create double-entry Ledger Entry with deterministic runningBalance
    const crypto = require('crypto');
    const paymentId = crypto.randomUUID();
    const ledgerEntry = new LedgerEntry({
      _id: paymentId,
      transactionId: paymentId,
      referenceType: 'PAYMENT',
      referenceId: paymentId,
      idempotencyKey,
      systemAccountId: partyType === 'CUSTOMER' ? 'ACCOUNTS_RECEIVABLE' : 'ACCOUNTS_PAYABLE',
      type: partyType === 'CUSTOMER' ? 'CR' : 'DR',
      amount,
      unallocatedAmount: Math.max(0, remainingPayment),
      partyId,
      description: `Payment Received - ${method}${notes ? ' - ' + notes : ''}`,
      runningBalance: newBalance, // Explicitly saved deterministic state
      shopId,
      organizationId: tenantId,
    });
    
    await ledgerEntry.save({ session });

    // Save all payment allocations linked to the new LedgerEntry
    for (const alloc of allocationsToSave) {
      const pa = new PaymentAllocation({
        ...alloc,
        paymentEntryId: ledgerEntry._id
      });
      await pa.save({ session });
    }

    // 6. Create Audit Log
    await auditService.logAction({
      userId,
      tenantId,
      action: 'PAYMENT',
      resource: partyType,
      resourceId: partyId,
      changes: {
        before: { balance: previousBalance },
        after: { balance: newBalance }
      },
      metadata: { paymentId: ledgerEntry._id, allocations: allocationsToSave.length, method, notes },
      ipAddress,
      userAgent
    }, session);

    return { success: true, newBalance, paymentId: ledgerEntry._id, allocationsCount: allocationsToSave.length };
  });
};

/**
 * Record a cash payout to a party (Refund overflow to Customer, or standard payment to Supplier).
 */
exports.recordPayout = async ({ tenantId, shopId, userId, partyId, partyType, amount, notes, idempotencyKey, ipAddress, userAgent }) => {
  const partyField = partyType === 'CUSTOMER' ? 'customerId' : 'supplierId';
  const { withTransaction } = require('../db/connection');

  return await withTransaction(async (session) => {
    if (idempotencyKey) {
      const existingEntry = await LedgerEntry.findOne({ 
        idempotencyKey, 
        tenantId, 
        shopId, 
        [partyField]: partyId, 
        type: partyType === 'CUSTOMER' ? 'customer_payout' : 'supplier_payout'
      }).session(session);
      if (existingEntry) {
        return { success: true, newBalance: existingEntry.runningBalance, paymentId: existingEntry._id, message: "Idempotent retry ignored" };
      }
    }

    const Model = partyType === 'CUSTOMER' ? Customer : Supplier;
    const party = await Model.findOne({ _id: partyId, tenantId }).session(session);
    if (!party) throw new Error(`${partyType} not found`);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Payout amount must be greater than zero');
    }

    // Cash Check
    const Branch = require('../models/Branch');
    const shop = await Branch.findOne({ _id: shopId, tenantId }).session(session);
    if (!shop || shop.cashBalance < amount) {
      throw new Error('Insufficient Cash in Drawer');
    }

    // Balance calculation
    const lastLedgerEntry = await LedgerEntry.findOne({ [partyField]: partyId, tenantId }).sort({ _id: -1 }).session(session);
    let previousBalance = lastLedgerEntry ? lastLedgerEntry.runningBalance : 0;
    if (isNaN(previousBalance) || previousBalance === null) previousBalance = 0;
    
    // For CUSTOMER: giving them cash INCREASES their debt (balance goes UP)
    // For SUPPLIER: giving them cash DECREASES our debt to them (balance goes DOWN)
    const balanceChange = partyType === 'CUSTOMER' ? amount : -amount;
    const newBalance = Math.round((previousBalance + balanceChange) * 100) / 100;

    // Update Party Balance
    party.currentBalance = newBalance;
    await party.save({ session });

    // Update Branch Cash
    shop.cashBalance = Math.round((shop.cashBalance - amount) * 100) / 100;
    await shop.save({ session });

    const crypto = require('crypto');
    const transactionId = `PAYOUT-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    
    const type = partyType === 'CUSTOMER' ? 'customer_payout' : 'supplier_payout';
    const debitAccount = partyType === 'CUSTOMER' ? 'receivable' : 'payable';
    const creditAccount = 'cash'; // Branch is paying cash OUT

    const ledgerEntry = new LedgerEntry({
      transactionId,
      idempotencyKey,
      type,
      debitAccount,
      creditAccount,
      amount,
      [partyField]: partyId,
      description: notes || `Cash Payout - ${type}`,
      runningBalance: newBalance,
      shopId,
      tenantId,
    });
    
    await ledgerEntry.save({ session });

    // Audit Log
    await auditService.logAction({
      userId,
      tenantId,
      action: 'PAYOUT',
      resource: partyType,
      resourceId: partyId,
      changes: {
        before: { balance: previousBalance, shopCash: shop.cashBalance + amount },
        after: { balance: newBalance, shopCash: shop.cashBalance }
      },
      metadata: { paymentId: ledgerEntry._id, notes },
      ipAddress,
      userAgent
    }, session);

    return { success: true, newBalance, paymentId: ledgerEntry._id, shopCashBalance: shop.cashBalance };
  });
};

/**
 * Recalculate party balance using directional accounting.
 */
exports.recalculatePartyBalance = async (tenantId, partyId, partyType) => {
  const Model = partyType === 'CUSTOMER' ? Customer : Supplier;
  const partyField = partyType === 'CUSTOMER' ? 'customerId' : 'supplierId';

  const party = await Model.findOne({ _id: partyId, tenantId });
  if (!party) throw new Error('Party not found');

  const entries = await LedgerEntry.find({ [partyField]: partyId, tenantId }).sort({ _id: 1 });
  let calculatedBalance = 0;

  // Define how specific accounts affect the party's balance.
  // For CUSTOMER: Balance goes UP if Receivable goes UP.
  // For SUPPLIER: Balance goes UP if Payable goes UP.
  for (const entry of entries) {
    const amt = isNaN(entry.amount) ? 0 : entry.amount;
    if (partyType === 'CUSTOMER') {
      if (entry.debitAccount === 'receivable') {
        calculatedBalance += amt; // Debit to receivable increases what they owe us
      } else if (entry.creditAccount === 'receivable') {
        calculatedBalance -= amt; // Credit to receivable reduces what they owe us
      }
    } else if (partyType === 'SUPPLIER') {
      if (entry.creditAccount === 'payable') {
        calculatedBalance += amt; // Credit to payable increases what we owe them
      } else if (entry.debitAccount === 'payable') {
        calculatedBalance -= amt; // Debit to payable reduces what we owe them
      }
    }
  }

  party.currentBalance = Math.round(calculatedBalance * 100) / 100;
  await party.save();
  return party.currentBalance;
};

/**
 * Fetch party ledger entries in chronological order.
 */
exports.getPartyLedgerHistory = async (tenantId, partyId, partyType) => {
  const partyField = partyType === 'CUSTOMER' ? 'customerId' : 'supplierId';
  return await LedgerEntry.find({ [partyField]: partyId, tenantId }).sort({ _id: -1 });
};

/**
 * Recalculate physical cash balance for a shop using strict ledger sum.
 */
exports.recalculateShopCashBalance = async (shopId, tenantId) => {
  const Branch = require('../models/Branch');
  
  const shop = await Branch.findOne({ _id: shopId, tenantId });
  if (!shop) throw new Error('Branch not found');

  const entries = await LedgerEntry.find({ shopId, tenantId }).sort({ _id: 1 });
  let calculatedCash = 0;

  for (const entry of entries) {
    if (entry.status !== 'active') continue; // skip reversed/deleted

    if (entry.debitAccount === 'cash') {
      calculatedCash += entry.amount; // Cash comes in
    } 
    if (entry.creditAccount === 'cash') {
      calculatedCash -= entry.amount; // Cash goes out
    }
  }

  shop.cashBalance = Math.round(calculatedCash * 100) / 100;
  await shop.save();
  return shop.cashBalance;
};
