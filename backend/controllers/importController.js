const { parsePDFBuffer } = require("../services/pdfParser.service");
const { extractMobileProducts } = require("../services/mobileParser.service");
const { findBestMatch } = require("../services/duplicateEngine.service");
const mongoose = require("mongoose");
const crypto = require("crypto");
const Product = require("../models/Product");
const Category = require("../models/Category");
const Supplier = require("../models/Supplier");
const StockMovement = require("../models/StockMovement");
const LedgerEntry = require("../models/LedgerEntry");
const AuditLog = require("../models/AuditLog");

exports.uploadPDF = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded or file is empty",
        pages: 0,
        rawLines: [],
        products: [],
        meta: { parsedCount: 0, matchedCount: 0 }
      });
    }

    if (req.file.mimetype !== "application/pdf") {
      return res.status(400).json({
        success: false,
        message: "Invalid file format. Only PDF files are allowed.",
        pages: 0,
        rawLines: [],
        products: [],
        meta: { parsedCount: 0, matchedCount: 0 }
      });
    }

    let result;
    try {
      result = await parsePDFBuffer(req.file.buffer);
    } catch (parseErr) {
      return res.status(422).json({
        success: false,
        message: "Failed to parse PDF file. The file might be corrupted or malformed.",
        pages: 0,
        rawLines: [],
        products: [],
        meta: { parsedCount: 0, matchedCount: 0 }
      });
    }

    const lines = (result && result.text) 
      ? result.text.split("\n").map((l) => l ? l.trim() : "").filter(Boolean)
      : [];

    let products = [];
    try {
      products = extractMobileProducts(lines) || [];
    } catch (extractErr) {
      console.error("Extraction error:", extractErr);
      products = [];
    }

    // 🔥 DUPLICATE DETECTION STEP (Safely wrapped)
    let enriched = [];
    let matchedCount = 0;
    
    if (products.length > 0) {
      enriched = await Promise.all(
        products.map(async (p) => {
          if (!p) return null;
          
          try {
            const match = await findBestMatch(p);
            if (match && match.status === "update") {
              matchedCount++;
            }
            return {
              ...p,
              matchStatus: match ? match.status : "new",
              matchedProductId: (match && match.product) ? match.product._id : null,
              matchReason: match ? match.reason : "Duplicate engine error",
            };
          } catch (matchErr) {
            console.error("Match error for product:", p.name, matchErr);
            return {
              ...p,
              matchStatus: "new",
              matchedProductId: null,
              matchReason: "Error during matching",
            };
          }
        })
      );
    }
    
    // Filter out any nulls that might have occurred
    enriched = enriched.filter(Boolean);

    return res.status(200).json({
      success: true,
      pages: result ? (result.pages || 0) : 0,
      rawLines: lines,
      products: enriched,
      meta: {
        parsedCount: enriched.length,
        matchedCount: matchedCount
      }
    });
  } catch (error) {
    console.error("Import pipeline error:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred during the import process.",
      pages: 0,
      rawLines: [],
      products: [],
      meta: { parsedCount: 0, matchedCount: 0 }
    });
  }
};

exports.commitPDFImport = async (req, res) => {
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
    const { customer, items, totalAmount, options } = req.body;
    const tenantId = req.tenantId;
    const shopId = req.user.shopId;
    const userId = req.user._id;

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

    // 2. Resolve Supplier (if options.type is credit)
    let finalSupplierId = options.supplierId || null;
    let supplierName = customer.name || "Unknown Supplier";

    if (options.type === 'credit' && !finalSupplierId) {
      // Find existing supplier by mobile
      let existingSupplier = await Supplier.findOne({ mobile: customer.phone, tenantId, shopId }).session(session);
      if (existingSupplier) {
        finalSupplierId = existingSupplier._id;
        supplierName = existingSupplier.name;
      } else {
        // Create new Supplier
        const supplier = new Supplier({
          name: customer.name || "Unknown Supplier",
          mobile: customer.phone || "0000000000",
          currentBalance: 0,
          shopId,
          tenantId,
          status: 'active'
        });
        const savedSupplier = await supplier.save({ session });
        finalSupplierId = savedSupplier._id;
      }
    }

    // 3. Process Items & Pricing & Stock
    let computedTotalCost = 0;

    for (const item of items) {
      const override = options.priceOverrides?.[item.name];
      let costPrice = item.price;
      
      // Backend Authority: Validate cost price overrides
      if (override && typeof override.costPrice === 'number' && override.costPrice > 0) {
        costPrice = override.costPrice;
      }

      // Backend Authority: Validate sale price overrides (must exceed cost to prevent losses)
      let salePrice = costPrice * 1.20; // 20% markup default
      if (override && typeof override.salePrice === 'number' && override.salePrice > costPrice) {
        salePrice = override.salePrice;
      }

      computedTotalCost += (costPrice * item.qty);

      // Find product by barcode, SKU, or name (to prevent name mismatch duplicates)
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

      if (product) {
        productId = product._id;
        // Update product prices and increase stock quantity
        product.purchasePrice = costPrice;
        product.price = salePrice;
        product.quantity += item.qty;
        product.isLowStock = product.quantity <= product.lowStockThreshold;
        await product.save({ session });
      } else {
        // Create new Product with secure unique SKU to prevent collisions
        product = new Product({
          name: item.name,
          sku: `IMP-${crypto.randomUUID().split("-")[0].toUpperCase()}`,
          barcode: item.barcode || undefined,
          category: category._id,
          price: salePrice,
          purchasePrice: costPrice,
          quantity: item.qty,
          lowStockThreshold: 5,
          shopId,
          tenantId,
          status: 'active'
        });
        const savedProduct = await product.save({ session });
        productId = savedProduct._id;
      }

      // Record StockMovement
      const movement = new StockMovement({
        productId,
        shopId,
        tenantId,
        quantity: item.qty,
        type: 'in',
        reason: 'purchase',
        referenceId: product._id, // product ref as fallback
        note: 'Procurement PDF Import'
      });
      await movement.save({ session });
    }

    const finalAmount = computedTotalCost > 0 ? computedTotalCost : totalAmount;

    // 4. Update supplier payable balance if credit and get runningBalance
    let runningBalance = 0;
    if (finalSupplierId) {
      const supplier = await Supplier.findById(finalSupplierId).session(session);
      if (supplier) {
        if (options.type === 'credit') {
          supplier.currentBalance = (supplier.currentBalance || 0) + finalAmount;
          await supplier.save({ session });
        }
        runningBalance = supplier.currentBalance || 0;
      }
    }

    // 5. Double-Entry Accounting Logs
    const transactionId = `PROC-${options.type === 'cash' ? 'CASH' : 'CRED'}-${Date.now()}`;
    const ledgerEntry = new LedgerEntry({
      transactionId,
      type: 'supplier_invoice',
      debitAccount: 'inventory',
      creditAccount: options.type === 'cash' ? 'cash' : 'payable',
      amount: finalAmount,
      supplierId: finalSupplierId || undefined,
      description: `${options.type === 'cash' ? 'Cash' : 'Credit'} Procurement Import - ${supplierName}`,
      runningBalance,
      shopId,
      tenantId
    });
    await ledgerEntry.save({ session });

    // 5. Create Audit Log
    const auditLog = new AuditLog({
      userId,
      tenantId,
      shopId,
      action: 'IMPORT_PURCHASE',
      resource: 'PRODUCT',
      resourceId: category._id, // category as fallback or log resource
      changes: {
        before: {},
        after: { type: options.type, amount: finalAmount }
      },
      metadata: { supplierId: finalSupplierId, transactionId }
    });
    await auditLog.save({ session });

    if (session) {
      await session.commitTransaction();
    }

    return res.status(200).json({
      success: true,
      data: {
        supplierId: finalSupplierId,
        totalCost: finalAmount
      },
      message: "Import processed and stock updated"
    });
  } catch (error) {
    if (session) await session.abortTransaction();
    console.error("Commit PDF Import Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "An error occurred during import commit"
    });
  } finally {
    if (session) session.endSession();
  }
};

