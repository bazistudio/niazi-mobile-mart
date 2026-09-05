const Product = require("../models/Product");
const StockMovement = require("../models/StockMovement");
const AuditLog = require("../models/AuditLog");
const inventoryService = require("../services/inventoryService");
const { processUnifiedImport } = require("../services/inventoryImport.service");

/**
 * inventoryController
 * Handles all stock-related business logic centrally on the backend.
 */

// ─── 0. Receive Stock (Purchasing) ─────────────────────────────────────────────
exports.receiveStock = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const shopId = req.user.shopId;
    const userId = req.user._id;

    if (!req.body.items || req.body.items.length === 0) {
      return res.status(400).json({ success: false, message: "Receipt must contain at least one item." });
    }

    const receipt = await inventoryService.receiveStock(req.body, tenantId, shopId, userId);

    res.status(201).json({
      success: true,
      message: "Stock received successfully",
      receipt
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── 1. Bulk Stock Adjustment ────────────────────────────────────────────────
exports.adjustStock = async (req, res) => {
  const { productId, type, quantity, reason, notes } = req.body;
  const shopId = req.user.shopId; // Assumes shopId is on req.user from auth middleware
  const tenantId = req.tenantId;

  try {
    const product = await Product.findOne({ _id: productId, tenantId, shopId });
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const previousStock = product.quantity;
    const delta = type === "INCREASE" ? Math.abs(quantity) : -Math.abs(quantity);
    const newStock = previousStock + delta;

    if (newStock < 0) {
      return res.status(400).json({ success: false, message: "Stock cannot be negative" });
    }

    // 1. Update Product Stock
    product.quantity = newStock;
    if (product.lowStockThreshold !== undefined) {
      product.isLowStock = product.quantity <= product.lowStockThreshold;
    }
    await product.save();

    // 2. Create Stock Movement Entry (The Ledger)
    await StockMovement.create({
      productId,
      tenantId,
      shopId,
      quantity: Math.abs(quantity),
      type: type === "INCREASE" ? "in" : "out",
      reason: "manual_adjustment",
      note: notes || reason || "Manual Adjustment"
    });

    // 3. Create Audit Log (Auto-Audit)
    await AuditLog.create({
      tenantId,
      userId: req.user._id,
      shopId,
      action: "STOCK_ADJUSTMENT",
      resourceId: productId,
      resource: "Product",
      description: `Stock adjusted for ${product.name}: ${previousStock} -> ${newStock} (${delta > 0 ? "+" : ""}${delta})`,
      metadata: { previousStock, newStock, delta, reason }
    });

    res.status(200).json({
      success: true,
      message: "Stock adjusted successfully",
      newStock
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── 2. Damage & Leakage Hub ─────────────────────────────────────────────────
exports.logDamage = async (req, res) => {
  const { productId, quantity, reason, status = "PENDING" } = req.body;
  const shopId = req.user.shopId;
  const tenantId = req.tenantId;

  try {
    const product = await Product.findOne({ _id: productId, tenantId, shopId });
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    // Deduct stock for damage
    const previousStock = product.quantity;
    product.quantity -= quantity;
    if (product.lowStockThreshold !== undefined) {
      product.isLowStock = product.quantity <= product.lowStockThreshold;
    }
    await product.save();

    // Log the movement
    await StockMovement.create({
      productId,
      tenantId,
      shopId,
      quantity: Math.abs(quantity),
      type: "out",
      reason: "manual_adjustment",
      note: reason || "Damage/Leakage",
    });

    // Auto-Audit
    await AuditLog.create({
      tenantId,
      userId: req.user._id,
      shopId,
      action: "STOCK_DAMAGE",
      resourceId: productId,
      resource: "Product",
      description: `Damage logged for ${product.name}: ${quantity} units removed.`,
      metadata: { productId, quantity, reason, status }
    });

    res.status(200).json({ success: true, message: "Damage logged successfully", currentStock: product.quantity });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── 3. Branch Transfer ──────────────────────────────────────────────────────
exports.transferStock = async (req, res) => {
  const { productId, fromBranchId, toBranchId, quantity, notes } = req.body;
  // Implementation of multi-tenant branch logic...
  // This would involve checking both branches and atomic updates.
  res.status(501).json({ success: false, message: "Branch Transfer logic migration in progress" });
};

// ─── 4. Manual Bulk Import ───────────────────────────────────────────────────
exports.manualImport = async (req, res) => {
  try {
    const { items, options } = req.body;
    const tenantId = req.tenantId;
    const shopId = req.user.shopId;
    const userId = req.user._id;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: "No items provided for import." });
    }

    const result = await processUnifiedImport({
      items,
      options: options || {},
      tenantId,
      shopId,
      userId,
      source: 'manual'
    });

    res.status(200).json({
      success: true,
      message: "Manual import processed successfully",
      data: result
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Failed to process manual import" });
  }
};

