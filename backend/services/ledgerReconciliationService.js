const LedgerEntry = require('../models/LedgerEntry');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const StockMovement = require('../models/StockMovement');
const Order = require('../models/Order');
const Invoice = require('../models/Invoice');
const Organization = require('../models/Organization');
const logger = require('../utils/logger');
const { runAsOrganization } = require('../middleware/context/asyncContext');
const crypto = require("crypto");

/**
 * Ensures mathematical certainty in the financial system.
 */
exports.reconcileCustomerBalances = async () => {
  const jobId = crypto.randomUUID();
  logger.info('Starting nightly ledger reconciliation...', { jobId });
  
  const organizations = await Organization.find({ status: { $ne: "suspended" } }).select("_id").setOptions({ skipTenantGuard: true }).lean();
  let totalDiscrepancies = 0;

  for (const org of organizations) {
    try {
      await runAsOrganization(org._id, { jobName: "reconcileCustomerBalances", requestId: jobId }, async () => {
        // 1. Group all ledger entries by customer to calculate true balance
        const aggregatedBalances = await LedgerEntry.aggregate([
          { $match: { customerId: { $exists: true }, status: 'active' } },
          {
            $group: {
              _id: '$customerId',
              totalDebit: { 
                $sum: { $cond: [{ $eq: ['$debitAccount', 'receivable'] }, '$amount', 0] } 
              },
              totalCredit: { 
                $sum: { $cond: [{ $eq: ['$creditAccount', 'receivable'] }, '$amount', 0] } 
              }
            }
          },
          {
            $project: {
              trueBalance: { $subtract: ['$totalDebit', '$totalCredit'] }
            }
          }
        ]);

        // 2. Compare calculated true balance vs cached balance on Customer model
        for (const record of aggregatedBalances) {
          const customer = await Customer.findById(record._id);
          if (!customer) continue;

          const drift = Math.abs(customer.currentBalance - record.trueBalance);

          // If drift is > 0.01 (accounting for float rounding)
          if (drift > 0.01) {
            totalDiscrepancies++;
            logger.error('CRITICAL: Ledger Drift Detected', {
              customerId: customer._id,
              tenantId: customer.tenantId,
              cachedBalance: customer.currentBalance,
              trueLedgerBalance: record.trueBalance,
              drift
            });
            // FUTURE: Send alert to slack/email or freeze account
          }
        }
      });
    } catch (orgError) {
      logger.error(`Failed to reconcile customer balances for org ${org._id}`, { error: orgError.message });
    }
  }

  logger.info(`Customer Reconciliation complete. Discrepancies found: ${totalDiscrepancies}`, { jobId });
  return totalDiscrepancies;
};

/**
 * Reconciles inventory stock against the source of truth (StockMovements)
 */
exports.reconcileInventory = async () => {
  const jobId = crypto.randomUUID();
  logger.info('Starting nightly inventory reconciliation...', { jobId });

  const organizations = await Organization.find({ status: { $ne: "suspended" } }).select("_id").setOptions({ skipTenantGuard: true }).lean();
  let totalDiscrepancies = 0;

  for (const org of organizations) {
    try {
      await runAsOrganization(org._id, { jobName: "reconcileInventory", requestId: jobId }, async () => {
        const aggregatedStock = await StockMovement.aggregate([
          {
            $group: {
              _id: '$productId',
              totalIn: { $sum: { $cond: [{ $eq: ['$type', 'in'] }, '$quantity', 0] } },
              totalOut: { $sum: { $cond: [{ $eq: ['$type', 'out'] }, '$quantity', 0] } }
            }
          },
          {
            $project: {
              trueStock: { $subtract: ['$totalIn', '$totalOut'] }
            }
          }
        ]);

        for (const record of aggregatedStock) {
          // Only check simple products that have stock
          const product = await Product.findOne({ _id: record._id, hasVariants: false }).lean();
          if (!product) continue;

          if (product.stock !== record.trueStock) {
            totalDiscrepancies++;
            logger.error('CRITICAL: Inventory Drift Detected', {
              productId: product._id,
              tenantId: product.tenantId,
              cachedStock: product.stock,
              trueStock: record.trueStock,
              drift: Math.abs(product.stock - record.trueStock)
            });
          }
        }
      });
    } catch (orgError) {
      logger.error(`Failed to reconcile inventory for org ${org._id}`, { error: orgError.message });
    }
  }

  logger.info(`Inventory Reconciliation complete. Discrepancies: ${totalDiscrepancies}`, { jobId });
  return totalDiscrepancies;
};

/**
 * Triple Match Validation: Ensures Order Total == Invoice Total == Ledger Amount
 */
exports.tripleMatchOrders = async () => {
  const jobId = crypto.randomUUID();
  logger.info('Starting nightly Triple-Match validation...', { jobId });

  const organizations = await Organization.find({ status: { $ne: "suspended" } }).select("_id").setOptions({ skipTenantGuard: true }).lean();
  let totalDiscrepancies = 0;

  for (const org of organizations) {
    try {
      await runAsOrganization(org._id, { jobName: "tripleMatchOrders", requestId: jobId }, async () => {
        // Limit to recent orders to avoid massive daily scans (e.g., last 3 days)
        const recentOrders = await Order.find({ 
          createdAt: { $gte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
          status: { $nin: ['cancelled'] }
        });

        for (const order of recentOrders) {
          const invoice = await Invoice.findOne({ orderId: order._id });
          const ledgerEntries = await LedgerEntry.find({ referenceId: order._id, status: 'active' });

          const orderTotal = order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0) + (order.tax || 0);
          const invoiceTotal = invoice ? invoice.grandTotal : null;
          const ledgerTotal = ledgerEntries.reduce((sum, entry) => sum + entry.amount, 0) / 2; // Divide by 2 because of double entry

          const isMatch = (invoiceTotal === null || Math.abs(orderTotal - invoiceTotal) < 0.01) &&
                          (ledgerEntries.length === 0 || Math.abs(orderTotal - ledgerTotal) < 0.01);

          if (!isMatch) {
            totalDiscrepancies++;
            logger.error('CRITICAL: Triple-Match Failure', {
              orderId: order._id,
              orderTotal,
              invoiceTotal,
              ledgerTotal
            });
          }
        }
      });
    } catch (orgError) {
      logger.error(`Failed to triple match orders for org ${org._id}`, { error: orgError.message });
    }
  }

  logger.info(`Triple-Match complete. Failures: ${totalDiscrepancies}`, { jobId });
  return totalDiscrepancies;
};
