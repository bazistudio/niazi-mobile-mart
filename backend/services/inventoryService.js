const mongoose = require("mongoose");
const { inventoryHandler } = require('../db');
const auditService = require('./auditService');
const defaultsService = require('./defaultsService');
const StockReceipt = require('../models/StockReceipt');
const StockMovement = require('../models/StockMovement');
const ProductPrice = require('../models/ProductPrice');
const Product = require('../models/Product');

/**
 * Reduce stock for a product
 * @param {string} productId - Product ID
 * @param {number} quantity - Quantity to reduce
 * @param {string} shopId - Shop ID
 * @param {string} tenantId - Tenant ID
 * @param {string} referenceId - Reference (Order ID)
 * @param {string} reason - Reason for reduction
 * @param {Object} session - Mongoose session
 * @param {string} userId - ID of user making the change
 */
exports.reduceStock = async ({ productId, quantity, shopId, tenantId, referenceId, reason = 'order', userId }, session) => {
  const { product, currentStock } = await inventoryHandler.atomicStockUpdate({
    productId,
    quantity: -quantity, 
    tenantId
  }, session);

  const beforeQuantity = currentStock;
  const afterQuantity = currentStock - quantity;

  // Log movement via DB Handler
  await inventoryHandler.recordMovement({
    productId,
    organizationId: tenantId,
    branchId: shopId,
    quantity,
    movementType: 'OUT',
    reason,
    referenceType: 'ORDER',
    referenceId
  }, session);
  
  // Audit Log
  if (userId) {
    await auditService.logAction({
      userId,
      tenantId,
      action: 'STOCK_REDUCE',
      resource: 'PRODUCT',
      resourceId: productId,
      changes: {
        before: { quantity: beforeQuantity },
        after: { quantity: afterQuantity }
      },
      metadata: { reason, referenceId, quantity }
    }, session);
  }

  return product;
};

/**
 * Restore stock for a product (e.g., on cancellation)
 * @param {string} productId - Product ID
 * @param {number} quantity - Quantity to restore
 * @param {string} shopId - Shop ID
 * @param {string} tenantId - Tenant ID
 * @param {string} referenceId - Reference (Order ID)
 * @param {string} reason - Reason for restoration
 * @param {Object} session - Mongoose session
 * @param {string} userId - ID of user making the change
 */
exports.restoreStock = async ({ productId, quantity, shopId, tenantId, referenceId, reason = 'cancelation', userId }, session) => {
  const { product, currentStock } = await inventoryHandler.atomicStockUpdate({
    productId,
    quantity: quantity, 
    tenantId
  }, session);

  const beforeQuantity = currentStock;
  const afterQuantity = currentStock + quantity;

  // Log movement via DB Handler
  await inventoryHandler.recordMovement({
    productId,
    organizationId: tenantId,
    branchId: shopId,
    quantity,
    movementType: 'IN',
    reason,
    referenceType: 'CANCELATION',
    referenceId
  }, session);

  // Audit Log
  if (userId) {
    await auditService.logAction({
      userId,
      tenantId,
      action: 'STOCK_RESTORE',
      resource: 'PRODUCT',
      resourceId: productId,
      changes: {
        before: { quantity: beforeQuantity },
        after: { quantity: afterQuantity }
      },
      metadata: { reason, referenceId, quantity }
    }, session);
  }

  return product;
};

/**
 * Receive Stock (Purchase Workflow)
 */
exports.receiveStock = async (receiptData, tenantId, shopId, userId) => {
  const client = mongoose.connection.getClient();
  const isReplicaSet = client.topology && (client.topology.description.type === 'ReplicaSetWithPrimary' || client.topology.description.type === 'ReplicaSetNoPrimary' || client.topology.description.type === 'Sharded');

  let session = null;
  if (isReplicaSet) {
    session = await mongoose.startSession();
    session.startTransaction();
  }
  const s = session || undefined;

  try {
    const warehouse = await defaultsService.getDefaultWarehouse(tenantId, shopId, s);
    const priceList = await defaultsService.getDefaultPriceList(tenantId, shopId, s);

    // Create StockReceipt parent record
    const receipt = new StockReceipt({
      receiptNo: receiptData.receiptNo || `RCT-${Date.now()}`,
      supplierId: receiptData.supplierId,
      warehouseId: receiptData.warehouseId || warehouse._id,
      invoiceNo: receiptData.invoiceNo,
      receiptDate: receiptData.receiptDate || new Date(),
      remarks: receiptData.remarks,
      totalAmount: receiptData.totalAmount || 0,
      items: receiptData.items,
      organizationId: tenantId,
      shopId: shopId
    });

    await receipt.save({ session: s });

    // Process each item in the receipt
    for (const item of receiptData.items) {
      // Create StockMovement IN
      const movement = new StockMovement({
        movementType: "IN",
        productId: item.productId,
        warehouseId: receipt.warehouseId,
        quantity: item.quantity,
        batchNumber: item.batchNo,
        reason: "Purchase",
        referenceType: "STOCK_RECEIPT",
        referenceId: receipt._id,
        organizationId: tenantId,
        branchId: shopId,
        shopId: shopId
      });
      await movement.save({ session: s });

      // Handle ProductPrice Updates if provided
      if (item.sellingPrice !== undefined || item.purchasePrice !== undefined) {
        const currentPrice = await ProductPrice.findOne({
          productId: item.productId,
          priceListId: priceList._id,
          isActive: true,
          organizationId: tenantId
        }).session(s);

        const newSellingPrice = item.sellingPrice !== undefined ? Number(item.sellingPrice) : (currentPrice ? currentPrice.price : 0);
        const newCostPrice = item.purchasePrice !== undefined ? Number(item.purchasePrice) : (currentPrice ? currentPrice.costPrice : 0);

        // Only create a new price version if prices differ
        if (!currentPrice || currentPrice.price !== newSellingPrice || currentPrice.costPrice !== newCostPrice) {
          if (currentPrice) {
            currentPrice.isActive = false;
            currentPrice.effectiveTo = new Date();
            await currentPrice.save({ session: s });
          }

          const product = await Product.findById(item.productId).select("baseUnitId").session(s);
          if (!product) throw new Error(`Product ${item.productId} not found`);

          const newPriceRecord = new ProductPrice({
            productId: item.productId,
            priceListId: priceList._id,
            unitId: product.baseUnitId,
            price: newSellingPrice,
            costPrice: newCostPrice,
            isActive: true,
            effectiveFrom: new Date(),
            effectiveTo: null,
            organizationId: tenantId,
            shopId: shopId
          });

          await newPriceRecord.save({ session: s });
        }
      }
    }

    if (userId) {
      await auditService.logAction({
        userId,
        tenantId,
        action: 'RECEIVE_STOCK',
        resource: 'STOCK_RECEIPT',
        resourceId: receipt._id,
        metadata: { itemsCount: receiptData.items.length, totalAmount: receipt.totalAmount }
      }, s);
    }

    if (session) {
      await session.commitTransaction();
      session.endSession();
    }

    return receipt;
  } catch (error) {
    if (session) {
      await session.abortTransaction();
      session.endSession();
    }
    throw error;
  }
};
