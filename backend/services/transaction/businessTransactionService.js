const mongoose = require("mongoose");
const IdempotencyRecord = require("../../models/IdempotencyRecord");
const Order = require("../../models/Order");
const Invoice = require("../../models/Invoice");
const Payment = require("../../models/Payment");
const StockMovement = require("../../models/StockMovement");
const LedgerEntry = require("../../models/LedgerEntry");
const Product = require("../../models/Product");

class BusinessTransactionService {
  /**
   * Safely execute a transaction with Idempotency Support
   */
  static async executeIdempotentTransaction(key, userId, organizationId, requestData, transactionFn) {
    // 1. Check idempotency
    let record = await IdempotencyRecord.findOne({ idempotencyKey: key, userId, organizationId });
    
    if (record) {
      if (record.responseStatus) {
        // Return cached successful response
        return record.responseBody;
      }
      throw new Error("Transaction is currently processing or failed previously. Please verify.");
    }

    // Create pending idempotency record
    record = new IdempotencyRecord({
      userId,
      organizationId,
      idempotencyKey: key,
      requestHash: "hash-placeholder", // In real app, hash the request body
      requestMethod: requestData.method || "POST",
      requestPath: requestData.path || "/api/transaction",
      transactionType: requestData.type || "GENERIC",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    });
    await record.save();

    const isStandalone = process.env.NO_TRANSACTIONS === '1';
    const session = isStandalone ? null : await mongoose.startSession();
    if (session) session.startTransaction();

    try {
      // Execute the business logic
      const result = await transactionFn(session);

      if (session) await session.commitTransaction();
      if (session) session.endSession();

      // Update idempotency record on success
      record.responseStatus = 200;
      record.responseBody = result;
      await record.save();

      return result;
    } catch (error) {
      if (session) await session.abortTransaction();
      if (session) session.endSession();
      
      // Clean up failed idempotency record so it can be retried safely
      await IdempotencyRecord.deleteOne({ _id: record._id });
      throw error;
    }
  }

  /**
   * Complete Sale Flow:
   * Order -> Invoice -> StockMovement -> Ledger -> Payment
   */
  static async processCompleteSale(payload, userId, organizationId) {
    const { idempotencyKey, partyId, items, paymentAmount, paymentMethod, warehouseId } = payload;
    
    return this.executeIdempotentTransaction(idempotencyKey, userId, organizationId, { type: "SALE" }, async (session) => {
      
      // 1. Validate Stock
      for (const item of items) {
        const product = await Product.findById(item.productId).session(session);
        if (!product) throw new Error(`Product ${item.productId} not found`);
        
        if (product.trackInventory && !product.allowNegativeStock) {
          // Check stock level logic here. For Phase 4 demonstration, we assume validation passes or fails.
          // In real app: fetch Inventory levels.
        }
      }

      // Calculate totals
      let subTotal = 0;
      let grandTotal = 0;
      items.forEach(i => {
        i.total = i.salePrice * i.quantity;
        subTotal += i.total;
      });
      grandTotal = subTotal; // simplified tax/discount

      const displayNumberBase = `SAL-${Date.now()}`;

      // 2. Create Order
      const order = new Order({
        displayNumber: `ORD-${displayNumberBase}`,
        partyId,
        status: "Completed",
        items,
        subTotal,
        grandTotal,
        organizationId // injected explicitly for standard bypass or let tenantGuard handle
      });
      await order.save({ session });

      // 3. Create Invoice
      const invoice = new Invoice({
        displayNumber: `INV-${displayNumberBase}`,
        orderId: order._id,
        partyId,
        status: paymentAmount >= grandTotal ? "Paid" : "Issued",
        items,
        subTotal,
        grandTotal,
        organizationId
      });
      await invoice.save({ session });

      // 4. Create Stock Movements
      for (const item of items) {
        const product = await Product.findById(item.productId).session(session);
        if (product.trackInventory) {
          const movement = new StockMovement({
            movementType: "OUT",
            productId: item.productId,
            warehouseId: warehouseId,
            quantity: item.quantity,
            referenceType: "INVOICE",
            referenceId: invoice._id,
            organizationId
          });
          await movement.save({ session });
        }
      }

      // 5. Create Ledger Entries (Double Entry: DR Accounts Receivable, CR Sales Revenue)
      const ledgerEntrySales = new LedgerEntry({
        systemAccountId: "SALES_REVENUE",
        partyId,
        transactionId: invoice._id,
        referenceType: "INVOICE",
        referenceId: invoice._id,
        type: "CR",
        amount: grandTotal,
        organizationId
      });
      await ledgerEntrySales.save({ session });

      const ledgerEntryAR = new LedgerEntry({
        systemAccountId: "ACCOUNTS_RECEIVABLE",
        partyId,
        transactionId: invoice._id,
        referenceType: "INVOICE",
        referenceId: invoice._id,
        type: "DR",
        amount: grandTotal,
        organizationId
      });
      await ledgerEntryAR.save({ session });

      // 6. Create Payment (Optional)
      let payment = null;
      if (paymentAmount > 0) {
        payment = new Payment({
          displayNumber: `PAY-${displayNumberBase}`,
          invoiceId: invoice._id,
          partyId,
          amount: paymentAmount,
          paymentMethod: paymentMethod || "CASH",
          organizationId
        });
        await payment.save({ session });

        // Ledger Entry for Payment: DR Cash, CR Accounts Receivable
        const ledgerEntryCash = new LedgerEntry({
          systemAccountId: "CASH",
          partyId,
          transactionId: payment._id,
          referenceType: "PAYMENT",
          referenceId: payment._id,
          type: "DR",
          amount: paymentAmount,
          organizationId
        });
        await ledgerEntryCash.save({ session });

        const ledgerEntryARPay = new LedgerEntry({
          systemAccountId: "ACCOUNTS_RECEIVABLE",
          partyId,
          transactionId: payment._id,
          referenceType: "PAYMENT",
          referenceId: payment._id,
          type: "CR",
          amount: paymentAmount,
          organizationId
        });
        await ledgerEntryARPay.save({ session });
      }

      return {
        orderId: order._id,
        invoiceId: invoice._id,
        paymentId: payment ? payment._id : null
      };
    });
  }
}

module.exports = BusinessTransactionService;
