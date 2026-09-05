const Product = require("../models/Product");
const Category = require("../models/Category");
const notificationService = require("../services/notificationService");
const searchCache = require("../services/searchCache.service");
const tenantPopulate = require("../utils/tenantPopulate");
const productService = require("../services/productService");
const crypto = require("crypto");

//
// ADD PRODUCT
//
exports.addProduct = async (req, res) => {
  try {
    const {
      name,
      price,
      quantity,
      category,
      categoryId,
      brandId,
      itemTypeId,
      baseUnitId,
      supplierId,
      description,
      lowStockThreshold,
      sku,
      purchasePrice,
      barcode,
      companyId,
      colorId,
      qualityId
    } = req.body;

    const branchId = req.branchId;
    const organizationId = req.organizationId;

    if (!name || price === undefined || quantity === undefined) {
      return res.status(400).json({ message: "Name, price and quantity are required" });
    }

    const imagePath = req.file ? `/uploads/products/${req.file.filename}` : undefined;

    let finalCategory = categoryId || category;
    if (!finalCategory || String(finalCategory).toLowerCase() === 'uncategorized') {
      let uncat = await Category.findOne({
        name: { $regex: /^uncategorized$/i },
        $or: [{ organizationId }, { organizationId: { $exists: false } }, { organizationId: null }]
      }).setOptions({ skipTenantGuard: true });
      if (!uncat) {
        uncat = await Category.create({ name: 'Uncategorized', categoryCode: 'UNCAT', organizationId, branchId });
      }
      finalCategory = uncat._id;
    }

    // Phase 4.3 - Validate master data organization isolation
    const validateMasterData = async (Model, id, name) => {
      if (id) {
        const exists = await Model.findOne({ _id: id, organizationId });
        if (!exists) {
          throw new Error(`Invalid ${name} or does not belong to your organization.`);
        }
      }
    };

    try {
      await validateMasterData(Category, finalCategory, 'category');
      await validateMasterData(require("../models/Brand"), brandId, 'brand');
      await validateMasterData(require("../models/Company"), companyId, 'company');
      await validateMasterData(require("../models/Color"), colorId, 'color');
      await validateMasterData(require("../models/Quality"), qualityId, 'quality');
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }

    const mongoose = require('mongoose');
    const productData = {
      name,
      productCode: req.body.productCode || 'PRD-' + crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase(),
      baseUnitId: baseUnitId || crypto.randomUUID(),
      categoryId: finalCategory,
      brandId: brandId || undefined,
      companyId: companyId || undefined,
      colorId: colorId || undefined,
      qualityId: qualityId || undefined,
      itemTypeId: itemTypeId || undefined,
      description,
      sku: sku || undefined,
      barcode: barcode || undefined,
      image: imagePath,
      minStock: lowStockThreshold !== undefined ? Number(lowStockThreshold) : 5,
      status: "ACTIVE",
      organizationId,
      branchId
    };

    const product = await productService.createProduct(
      productData,
      price,
      purchasePrice !== undefined ? purchasePrice : 0,
      quantity,
      organizationId,
      branchId
    );


    // Invalidate search cache for this organization
    await searchCache.invalidate(`products:search:${organizationId}:*`);


    await notificationService.checkAndNotifyLowStock(product, branchId);

    res.status(201).json({
      message: "Product added successfully",
      product,
    });

  } catch (error) {
    console.error('[addProduct ERROR]', error.message, error.stack);
    res.status(500).json({
      message: error.message,
      stack: error.stack
    });
  }
};

//
// GET ALL PRODUCTS (Super Admin)
//
exports.getProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    // Strict Multi-tenant isolation
    const filter = { 
      organizationId: req.organizationId,
      status: "ACTIVE",
      isDeleted: false
    };
    
    const products = await Product.find(filter)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Product.countDocuments(filter);

    res.json({
      products,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

//
// GET PRODUCTS FOR LOGGED-IN SHOP
//
exports.getShopProducts = async (req, res) => {
  try {
    const branchId = req.branchId;
    const organizationId = req.organizationId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const filter = { 
      status: "ACTIVE",
      organizationId,
      isDeleted: false
    };
    
    // Support legacy and new category filter
    if (req.query.category) filter.categoryId = req.query.category;
    if (req.query.categoryId) filter.categoryId = req.query.categoryId;
    
    // Master data filters
    if (req.query.brandId) filter.brandId = req.query.brandId;
    if (req.query.companyId) filter.companyId = req.query.companyId;
    if (req.query.colorId) filter.colorId = req.query.colorId;
    if (req.query.qualityId) filter.qualityId = req.query.qualityId;
    
    // Search filter
    if (req.query.search) {
      filter.$or = [
        { name: { $regex: req.query.search, $options: 'i' } },
        { sku: { $regex: req.query.search, $options: 'i' } },
        { productCode: { $regex: req.query.search, $options: 'i' } },
      ];
    }

    const products = await Product.find(filter)
      .populate(tenantPopulate("categoryId", "name", organizationId))
      .populate(tenantPopulate("brandId", "name", organizationId))
      .populate(tenantPopulate("companyId", "name", organizationId))
      .populate(tenantPopulate("colorId", "name hexCode", organizationId))
      .populate(tenantPopulate("qualityId", "name", organizationId))
      .populate(tenantPopulate("itemTypeId", "name", organizationId))
      .populate(tenantPopulate("baseUnitId", "name", organizationId))
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Product.countDocuments(filter);

    const mappedProducts = await productService.mapProductsWithV3Data(products, organizationId, branchId);

    res.json({
      products: mappedProducts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

//
// UPDATE PRODUCT
//
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.organizationId;
    const branchId = req.branchId;

    const product = await Product.findOne({ _id: id, organizationId, isDeleted: false });

    if (!product) {
      return res.status(404).json({
        message: "Product not found or access denied",
      });
    }

    const { price, purchasePrice, quantity, ...otherUpdates } = req.body;
    if (req.file) {
      otherUpdates.image = `/uploads/products/${req.file.filename}`;
    }

    if (!otherUpdates.category || String(otherUpdates.category).toLowerCase() === 'uncategorized') {
      let uncat = await Category.findOne({
        name: { $regex: /^uncategorized$/i },
        $or: [{ organizationId }, { organizationId: { $exists: false } }, { organizationId: null }]
      }).setOptions({ skipTenantGuard: true });
      if (!uncat) {
        uncat = await Category.create({ name: 'Uncategorized', categoryCode: 'UNCAT', organizationId, branchId });
      }
      otherUpdates.category = uncat._id;
    }

    const updatedProduct = await productService.updateProduct({
      product,
      updates: otherUpdates,
      branchId,
      organizationId,
      newSalePrice: price
    });

    // Invalidate search cache for this organization
    await searchCache.invalidate(`products:search:${organizationId}:*`);

    await notificationService.checkAndNotifyLowStock(updatedProduct, branchId);

    const mappedProduct = await productService.mapProductWithV3Data(updatedProduct, organizationId, branchId);

    res.json({
      message: "Product updated successfully",
      product: mappedProduct,
    });

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

//
// DELETE PRODUCT
//
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.organizationId;

    const product = await Product.findOne({ _id: id, organizationId });

    if (!product) {
      return res.status(404).json({
        message: "Product not found or access denied",
      });
    }

    // SOFT DELETE ONLY — preserves audit logs, invoice references, and future restore capability
    product.status = "INACTIVE";
    product.isDeleted = true;
    await product.save();

    // Invalidate search cache for this organization
    await searchCache.invalidate(`products:search:${organizationId}:*`);

    res.json({
      message: "Product deleted successfully",
    });

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

//
// CHECK DUPLICATE (Phase 5 PDF Import)
// 4-level check: SKU → Barcode → Exact Name → Possible Matches
//
exports.checkDuplicate = async (req, res) => {
  try {
    const { sku, barcode, name } = req.query;
    const filter = { status: 'ACTIVE' };

    // Level 1: SKU match (exact)
    if (sku) {
      const p = await Product.findOne({ ...filter, sku }).select('_id name sku barcode');
      if (p) return res.json({ exists: true, productId: p._id, matchType: 'sku', product: p });
    }

    // Level 2: Barcode match (exact)
    if (barcode) {
      const p = await Product.findOne({ ...filter, barcode }).select('_id name sku barcode');
      if (p) return res.json({ exists: true, productId: p._id, matchType: 'barcode', product: p });
    }

    // Level 3: Exact name match (case-insensitive) - Soft warning, does not block
    if (name) {
      const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const existingProducts = await Product.find({
        ...filter,
        name: { $regex: `^${escapedName}$`, $options: 'i' }
      }).select('_id name sku barcode shopId');
      
      if (existingProducts.length > 0) {
        return res.json({ 
          exists: false, 
          sameNameExists: true, 
          matchType: 'name', 
          existingProducts 
        });
      }
    }

    // Level 4: Possible matches — model number substring (for mobile dealer codes like X680, A12)
    if (name) {
      const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const candidates = await Product.find({
        ...filter,
        name: { $regex: escapedName, $options: 'i' }
      }).limit(5).select('_id name sku barcode');

      if (candidates.length > 0) {
        return res.json({ exists: false, matchType: 'possible', possibleMatches: candidates });
      }
    }

    return res.json({ exists: false, matchType: 'none' });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


//
// SEARCH PRODUCTS (Marketplace Ready)
//
exports.searchProducts = async (req, res) => {
  try {
    const { keyword } = req.query;

    const filter = {
      name: {
        $regex: keyword,
        $options: "i",
      },
      status: "ACTIVE",
      isDeleted: false,
      organizationId: req.organizationId
    };

    if (req.query.category) {
      filter.category = req.query.category;
    }

    const cacheKey = `products:search:${req.organizationId}:${keyword || ''}:${req.query.category || ''}`;

    const products = await searchCache.getOrSet(cacheKey, async () => {
      return await Product.find(filter)
        .populate(tenantPopulate("categoryId", "name", req.organizationId));
    }, 300); // Cache search results for 5 minutes

    const mappedProducts = await productService.mapProductsWithV3Data(products, req.organizationId, req.branchId);

    res.json(mappedProducts);


  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

//
// GET LOW STOCK PRODUCTS
//
exports.getLowStockProducts = async (req, res) => {
  try {
    const branchId = req.branchId;
    const organizationId = req.organizationId;

    // Use aggregation to find low stock using V3 StockMovement
    const lowStockAggr = await require('../models/StockMovement').aggregate([
      { $match: { organizationId } },
      {
        $group: {
          _id: "$productId",
          totalStock: {
            $sum: { $cond: [{ $eq: ["$movementType", "IN"] }, "$quantity", { $multiply: ["$quantity", -1] }] }
          }
        }
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: "$product" },
      { $match: { "product.status": "ACTIVE" } },
      {
        $project: {
          product: 1,
          totalStock: 1,
          isLow: { $lte: ["$totalStock", { $ifNull: ["$product.minimumStock", 5] }] }
        }
      },
      { $match: { isLow: true } },
      { $sort: { totalStock: 1 } }
    ]);

    const mappedProducts = await Promise.all(lowStockAggr.map(async item => {
       const productDoc = new Product(item.product);
       return await productService.mapProductWithV3Data(productDoc, organizationId, branchId);
    }));

    res.json({
      success: true,
      data: mappedProducts
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};