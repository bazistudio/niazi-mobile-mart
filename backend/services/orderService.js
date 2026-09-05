const { 
  orderHandler, 
  transactionHandler, 
  productHandler, 
  customerHandler, 
  startSession 
} = require('../db');
const inventoryService = require('./inventoryService');
const auditService = require('./auditService');
const financialEngine = require('../utils/financialEngine');
const industryService = require('./industryService');
const tenantPopulate = require('../utils/tenantPopulate');
const productService = require('./productService');

/**
 * FUTURE EVOLUTION NOTE (God Service Prevention):
 * This service currently houses silent business coupling (inventory, ledger, invoice, audit).
 * Next architectural evolution must introduce an OrderOrchestrator to split responsibilities:
 * OrderOrchestrator
 * ├── OrderService
 * ├── InventoryService (Queue-based / Optimistic locking for high DB contention)
 * ├── AccountingService
 * ├── InvoiceService
 */
class OrderService {
  /**
   * Process a new order
   * FUTURE (CRITICAL): Implement Idempotency Keys here (stored in DB processed requests table)
   * to prevent duplicate side effects on Cloud Run retries.
   */
  async processOrder({ items, customerId, paymentMethod, transactionType = 'sale', taxRate = 0, discount = 0, linkedInvoiceId, tenantId, shopId, userId }) {
    const session = await startSession();

    try {
      if ((!items || items.length === 0) && transactionType !== 'refund_adjustment') {
        throw new Error("Order must have at least one item unless it's a refund adjustment");
      }

      // 1. Fetch current prices for all items to prevent tampering via Repository Layer
      const productIds = items.map(i => i.productId);
      const rawDbProducts = await productHandler.findProductsByIds(productIds, tenantId, shopId, session);
      
      // Hydrate products with V3 dynamic stock and prices
      const dbProducts = await productService.mapProductsWithV3Data(rawDbProducts, tenantId, shopId);

      const verifiedItems = items.map(item => {
        const dbProduct = dbProducts.find(p => p._id.toString() === item.productId.toString());
        if (!dbProduct) {
          throw new Error(`Product not found: ${item.productId}`);
        }
        
        if (dbProduct.industry === "pharmacy") {
          industryService.validatePharmacyItem(dbProduct, item.quantity);
        }
        
        return {
          ...item,
          // Snapshot Price (ERP compliance) from DB exclusively. Front-end price is ignored.
          salePrice: dbProduct.price !== undefined ? dbProduct.price : (item.salePrice || 0), 
          purchasePrice: dbProduct.purchasePrice !== undefined ? dbProduct.purchasePrice : 0,
          productName: dbProduct.name,    // Snapshot Name
          sku: dbProduct.sku,      // Snapshot SKU
          unitName: dbProduct.baseUnitId ? dbProduct.baseUnitId.toString() : '' // Snapshot Unit
        };
      });

      const totals = financialEngine.calculateOrderTotals(verifiedItems, taxRate, discount);
      
      const Counter = require('../models/Counter');
      const counter = await Counter.findOneAndUpdate(
        { _id: `order_seq:${tenantId}` },
        { $inc: { seq: 1 } },
        { new: true, upsert: true, session }
      );
      
      const orderNumber = `ORD-${counter.seq.toString().padStart(6, '0')}`;

      // ─── Full Return Auto-Status Update ────────────────────────────────────
      if (transactionType === 'invoice_return' && linkedInvoiceId) {
        const originalOrder = await orderHandler.getOrderById(linkedInvoiceId, tenantId, session);
        if (originalOrder) {
          // If the return amount exactly matches the original grand total, mark old invoice as returned
          if (Math.abs(totals.grandTotal) === originalOrder.totalAmount) {
            originalOrder.paymentStatus = 'returned';
            await originalOrder.save({ session });
          }
        }
      }

      // Credit check moved to after order creation so we have order._id for ledger

      // ─── Anomaly Detection (Suspicious Transaction Flags) ──────────────────────
      const SUSPICIOUS_THRESHOLD = 250000; // e.g. 250,000 PKR
      let isFlagged = false;
      
      if (totals.grandTotal > SUSPICIOUS_THRESHOLD) {
        isFlagged = true;
        
        // Velocity check: 5+ high-value orders in 10 minutes
        const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
        const recentHighValueOrders = await orderHandler.countOrders({
          tenantId,
          isFlagged: true,
          createdAt: { $gte: tenMinsAgo }
        }, session);

        if (recentHighValueOrders >= 5) {
          // Log Critical Velocity Abuse
          await auditService.logAction({
            userId,
            tenantId,
            action: 'SUSPICIOUS_VELOCITY_DETECTED',
            resource: 'ORDER',
            metadata: { count: recentHighValueOrders, amount: totals.grandTotal }
          }, session);
        }
      }

      // ─── Save Order via Handler ──────────────────────────────────────
      // Fix items for V3 schema (total from itemTotal)
      const v3Items = totals.items.map(i => ({ ...i, total: i.itemTotal || (i.salePrice * i.quantity) }));

      // ─── Save Order via Handler ──────────────────────────────────────
      const orderData = {
        orderNumber,
        displayNumber: orderNumber,
        items: v3Items, // Has snapshots
        partyId: customerId || '000000000000000000000000', // Mock party if null
        customerId,
        subTotal: totals.subtotal,
        taxTotal: totals.taxAmount,
        discountTotal: totals.discountAmount,
        grandTotal: totals.grandTotal, 
        paymentMethod,
        transactionType,
        paymentStatus: paymentMethod === "credit" ? "pending" : "paid",
        organizationId: tenantId,
        tenantId,
        branchId: shopId,
        shopId,
        status: "Completed",
        isFlagged
      };

      const order = await orderHandler.createOrder(orderData, session);

      // ─── Customer Credit & Ledger Entry ───────────────────────────────────────
      if (customerId && customerId !== '000000000000000000000000') {
        // 1. ALWAYS record the Invoice (DR) to the customer's ledger
        await transactionHandler.addCustomerCharge({
          customerId,
          amount: totals.grandTotal, // Increase debt
          tenantId,
          shopId,
          ledgerData: {
            systemAccountId: 'ACCOUNTS_RECEIVABLE',
            partyId: customerId,
            transactionId: order._id,
            referenceType: 'INVOICE',
            referenceId: order._id,
            type: 'DR',
            amount: totals.grandTotal
          }
        }, session);

        // 2. If paid via cash/card/etc at the time of sale, immediately record the payment (CR)
        if (paymentMethod !== "credit" && paymentMethod !== "unpaid") {
          await transactionHandler.addCustomerCharge({
            customerId,
            amount: -totals.grandTotal, // Decrease debt back to what it was
            tenantId,
            shopId,
            ledgerData: {
              systemAccountId: paymentMethod.toUpperCase(),
              partyId: customerId,
              transactionId: order._id,
              referenceType: 'PAYMENT',
              referenceId: order._id,
              type: 'CR',
              amount: totals.grandTotal,
              notes: `Immediate payment via ${paymentMethod}`
            }
          }, session);
        }
      } else if (paymentMethod === "credit") {
        throw new Error("Customer is required for credit payment method");
      }

      // ─── Process Stock via Inventory Service (Parallel Execution) ──────────────
      await Promise.all(items.map(item => 
        inventoryService.reduceStock({
          productId: item.productId,
          quantity: item.quantity,
          shopId,
          tenantId,
          referenceId: order._id,
          reason: 'order',
          userId
        }, session)
      ));

      // ─── Event Bus: Decouple auxiliary tasks (Invoice & Audit) ───────────────────
      const { emitEvent } = require('../queues/eventQueue');
      await emitEvent('ORDER_CREATED', {
        orderId: order._id,
        orderNumber,
        totalAmount: totals.grandTotal,
        tenantId,
        userId
      });

      if (session?.inTransaction?.()) {
        await session.commitTransaction();
      }

      return order;
    } catch (error) {
      if (session?.inTransaction?.()) {
        await session.abortTransaction();
      }
      throw error;
    } finally {
      if (session) session.endSession();
    }
  }

  /**
   * Update order status
   */
  async updateOrderStatus({ orderId, status, tenantId, userId }) {
    const session = await startSession();

    try {
      const validStatuses = ["pending", "completed", "cancelled"];
      if (!validStatuses.includes(status)) {
        throw new Error("Invalid status update");
      }

      const order = await orderHandler.getOrderById(orderId, tenantId, session);
      if (!order) {
        throw new Error("Order not found");
      }

      // ─── Cancellation Handling: Restore Stock ─────────────────────────────────
      if (status === "cancelled" && order.status !== "cancelled") {
        
        // Restore Stock (Parallel Execution)
        await Promise.all(order.items.map(item => 
          inventoryService.restoreStock({
            productId: item.productId,
            quantity: item.quantity,
            shopId: order.shopId,
            tenantId,
            referenceId: order._id,
            reason: 'cancelation',
            userId
          }, session)
        ));

        // Revert Customer Balance for credit payments
        if (order.paymentMethod === "credit" && order.customerId) {
          // Add negative amount to reduce debt
          await transactionHandler.addCustomerCharge({
            customerId: order.customerId,
            amount: -order.totalAmount, 
            tenantId,
            ledgerData: {
              transactionId: order.orderNumber,
              type: 'sale',
              debitAccount: 'sales_returns',
              creditAccount: 'receivable',
              description: `Cancelled Credit Sale - Order ${order.orderNumber}`,
              shopId: order.shopId
            }
          }, session);
        }

        const { emitEvent } = require('../queues/eventQueue');
        await emitEvent('ORDER_CANCELLED', {
          orderId: order._id,
          orderNumber: order.orderNumber,
          tenantId,
          userId
        });
      } else if (status !== order.status) {
         await auditService.logAction({
          userId,
          tenantId,
          action: 'UPDATE_STATUS',
          resource: 'ORDER',
          resourceId: order._id,
          metadata: { from: order.status, to: status }
        }, session);
      }

      // Use Handler to update, preserving abstraction
      const updatedOrder = await orderHandler.updateOrderStatus(order._id, tenantId, status, session);

      if (session?.inTransaction?.()) {
        await session.commitTransaction();
      }

      return updatedOrder;
    } catch (error) {
      if (session?.inTransaction?.()) {
        await session.abortTransaction();
      }
      throw error;
    } finally {
      if (session) session.endSession();
    }
  }

  /**
   * Get Orders (Pagination)
   */
  async getOrders(params) {
    return await orderHandler.getOrders(params);
  }

  /**
   * Get Single Order
   */
  async getOrderById(orderId, tenantId) {
    const order = await orderHandler.getOrderById(orderId, tenantId);
    if (order) {
      await order.populate(tenantPopulate("customerId", "name email phone address", tenantId));
    }
    return order;
  }
}

module.exports = new OrderService();
