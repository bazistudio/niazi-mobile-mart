const mongoose = require("mongoose");
const crypto = require("crypto");
const Product = require("../models/Product");
const Category = require("../models/Category");
const Supplier = require("../models/Supplier");
const StockMovement = require("../models/StockMovement");
const LedgerEntry = require("../models/LedgerEntry");
const AuditLog = require("../models/AuditLog");

/**
 * Process unified inventory import.
 * Handles product creation/updating, stock movements, and optional supplier ledger integration.
 */
exports.processUnifiedImport = async ({ items, options, tenantId, shopId, userId, source = 'manual' }) => {
  let session = null;
  if (mongoose.connection.readyState === 1) {
    try {
      session = await mongoose.startSession();
      session.startTransaction();
    } catch (txnError) {
      console.warn("Transactions not supported or failed to start session:", txnError.message);
      session = null;
    }
  }

  try {
    if (!items || items.length === 0) {
      throw new Error("No items to import");
    }

    // 1. Resolve Category "Imported"
    let category = await Category.findOne({ name: 'Imported', tenantId, shopId }).session(session);
    if (!category) {
      category = new Category({
        name: 'Imported',
        categoryCode: 'IMPORT',
        description: 'Imported products category',
        shopId,
        tenantId,
        status: 'active'
      });
      await category.save({ session });
    }

    // 2. Resolve Supplier (if options.supplierId exists)
    let finalSupplierId = options.supplierId || null;
    let supplierName = "Unknown Supplier";

    if (finalSupplierId) {
      const existingSupplier = await Supplier.findById(finalSupplierId).session(session);
      if (existingSupplier) {
        supplierName = existingSupplier.name;
      } else {
        throw new Error("Provided Supplier ID not found");
      }
    }

    // 3. Process Items & Pricing & Stock
    let computedTotalCost = 0;
    let productsCreated = 0;
    let productsUpdated = 0;
    let totalQuantity = 0;

    for (const item of items) {
      let costPrice = Number(item.costPrice || item.price || 0);
      let salePrice = Number(item.salePrice || (costPrice * 1.20));
      let qty = Number(item.qty || 1);
      
      computedTotalCost += (costPrice * qty);
      totalQuantity += qty;

      // Find product by barcode, SKU, or name
      const productQuery = { tenantId, shopId };
      if (item.barcode) {
        productQuery.barcode = item.barcode;
      } else if (item.sku) {
        productQuery.sku = item.sku;
      } else {
        productQuery.name = item.name;
      }

      let product = await Product.findOne(productQuery).session(session);
      let productId;

      // Ensure STD price list exists for ProductPrice
      const PriceList = require("../models/PriceList");
      const ProductPrice = require("../models/ProductPrice");
      let priceList = await PriceList.findOne({ 
        organizationId: tenantId, 
        priceListCode: 'STD' 
      }).session(session);
      
      if (!priceList) {
        const createdLists = await PriceList.create([{
          name: 'Standard Price List',
          priceListCode: 'STD',
          priority: 1,
          isActive: true,
          organizationId: tenantId,
          shopId
        }], { session });
        priceList = createdLists[0];
      } else if (!priceList.isActive) {
        priceList.isActive = true;
        await priceList.save({ session });
      }

      if (product) {
        productId = product._id;
        // Update product prices and increase stock quantity
        product.lastPurchasePrice = costPrice;
        product.averageCost = costPrice;
        product.sellingPrice = salePrice;
        
        // V2 legacy fallback for safety
        product.purchasePrice = costPrice;
        product.price = salePrice;

        product.currentStock = (product.currentStock || 0) + qty;
        product.quantity = product.currentStock; // V2 legacy
        
        const lowStockThresh = item.lowStockAlert !== undefined ? item.lowStockAlert : (product.minimumStock || product.lowStockThreshold || 5);
        product.minimumStock = lowStockThresh;
        product.lowStockThreshold = lowStockThresh; // V2 legacy
        
        product.isLowStock = product.currentStock <= lowStockThresh;
        
        await product.save({ session });

        // Update or create ProductPrice
        let existingPrice = await ProductPrice.findOne({ productId, priceListId: priceList._id }).session(session);
        if (existingPrice) {
          existingPrice.price = salePrice;
          existingPrice.costPrice = costPrice;
          await existingPrice.save({ session });
        } else {
          const pp = new ProductPrice({
            productId,
            priceListId: priceList._id,
            unitId: product.baseUnitId || crypto.randomUUID(),
            price: salePrice,
            costPrice: costPrice,
            organizationId: tenantId,
            shopId
          });
          await pp.save({ session });
        }

        productsUpdated++;
      } else {
        // Create new Product with secure unique SKU if not provided
        const genSku = item.sku || `IMP-${crypto.randomUUID().split("-")[0].toUpperCase()}`;
        const baseUnitId = crypto.randomUUID();
        product = new Product({
          name: item.name,
          sku: genSku,
          barcode: item.barcode || undefined,
          categoryId: category._id, // V3 relationship
          category: category._id, // V2 legacy
          baseUnitId: baseUnitId,
          
          sellingPrice: salePrice,
          lastPurchasePrice: costPrice,
          averageCost: costPrice,
          currentStock: qty,
          minimumStock: item.lowStockAlert !== undefined ? item.lowStockAlert : 5,

          price: salePrice, // V2 legacy
          purchasePrice: costPrice, // V2 legacy
          quantity: qty, // V2 legacy
          lowStockThreshold: item.lowStockAlert !== undefined ? item.lowStockAlert : 5, // V2 legacy
          
          shopId,
          tenantId,
          organizationId: tenantId,
          status: 'ACTIVE'
        });
        const savedProduct = await product.save({ session });
        productId = savedProduct._id;

        // Create initial ProductPrice
        const pp = new ProductPrice({
          productId,
          priceListId: priceList._id,
          unitId: baseUnitId,
          price: salePrice,
          costPrice: costPrice,
          organizationId: tenantId,
          shopId
        });
        await pp.save({ session });

        productsCreated++;
      }

      // Record StockMovement
      const movement = new StockMovement({
        productId,
        shopId,
        tenantId,
        quantity: qty,
        type: 'in',
        reason: finalSupplierId ? 'purchase' : 'manual_adjustment',
        referenceId: product._id, 
        note: `Procurement ${source} Import`
      });
      await movement.save({ session });
    }

    // 4. Supplier Ledger Entry (if supplier selected)
    let runningBalance = 0;
    if (finalSupplierId) {
      const supplier = await Supplier.findById(finalSupplierId).session(session);
      if (supplier) {
        // Always treat as credit purchase when mapped to a supplier in this flow, or as specified by options
        supplier.currentBalance = (supplier.currentBalance || 0) + computedTotalCost;
        await supplier.save({ session });
        runningBalance = supplier.currentBalance || 0;

        const transactionId = `PROC-CRED-${Date.now()}`;
        const ledgerEntry = new LedgerEntry({
          transactionId,
          type: 'supplier_invoice',
          debitAccount: 'inventory',
          creditAccount: 'payable',
          amount: computedTotalCost,
          supplierId: finalSupplierId,
          description: `Credit Procurement Import (${source}) - ${supplierName}`,
          runningBalance,
          shopId,
          tenantId
        });
        await ledgerEntry.save({ session });
      }
    }

    // 5. Create Audit Log / Import History
    const auditLog = new AuditLog({
      userId,
      tenantId,
      shopId,
      action: 'IMPORT_PURCHASE',
      resource: 'PRODUCT',
      resourceId: category._id,
      changes: {
        before: {},
        after: { 
          source, 
          totalCost: computedTotalCost,
          productsCreated,
          productsUpdated,
          totalQuantity
        }
      },
      metadata: { 
        supplierId: finalSupplierId, 
        invoiceNumber: options.invoiceNumber || 'N/A' 
      }
    });
    await auditLog.save({ session });

    if (session) {
      await session.commitTransaction();
    }

    return {
      supplierId: finalSupplierId,
      totalCost: computedTotalCost,
      productsCreated,
      productsUpdated,
      totalQuantity
    };
  } catch (error) {
    if (session) await session.abortTransaction();
    console.error("Unified Import Error:", error);
    throw error;
  } finally {
    if (session) session.endSession();
  }
};
