const mongoose = require('mongoose');
const Product = require('../models/Product');
const ProductPrice = require('../models/ProductPrice');
const StockMovement = require('../models/StockMovement');
const Warehouse = require('../models/Warehouse');
const PriceList = require('../models/PriceList');
const Branch = require('../models/Branch');

/**
 * Creates a new Product with its initial ProductPrice and StockMovement.
 * This is wrapped in a MongoDB transaction to ensure data consistency.
 */
exports.createProduct = async (productData, price, purchasePrice, quantity, organizationId, branchId) => {
  const client = mongoose.connection.getClient();
  const isReplicaSet = client.topology && (client.topology.description.type === 'ReplicaSetWithPrimary' || client.topology.description.type === 'ReplicaSetNoPrimary' || client.topology.description.type === 'Sharded');

  let session = null;
  if (isReplicaSet) {
    session = await mongoose.startSession();
    session.startTransaction();
  }
  const s = session || undefined;

  try {
    // 1. Ensure a Branch exists (upsert - safe for concurrent requests)
    const branch = await Branch.findOneAndUpdate(
      { organizationId, code: 'MAIN' },
      { $setOnInsert: { name: 'Main Branch', code: 'MAIN', organizationId } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // 2. Ensure "Main Warehouse" exists (upsert)
    const warehouse = await Warehouse.findOneAndUpdate(
      { organizationId, warehouseCode: 'MAIN-WH' },
      { $setOnInsert: { name: 'Main Warehouse', warehouseCode: 'MAIN-WH', branchId: branch._id, isDefault: true, organizationId } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // 3. Ensure "Standard Price List" exists (upsert)
    const priceList = await PriceList.findOneAndUpdate(
      { organizationId, priceListCode: 'STD' },
      { $setOnInsert: { name: 'Standard Price List', priceListCode: 'STD', priority: 1, isActive: true, organizationId } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // 4. Create Product (V3: No tenantId explicit payload, rely on organizationId)
    const product = new Product({
      ...productData,
      organizationId,
      branchId
    });

    await product.save({ session: s });

    // 5. Create ProductPrice
    const productPrice = new ProductPrice({
      productId: product._id,
      priceListId: priceList._id,
      unitId: product.baseUnitId,
      price: Number(price),
      costPrice: Number(purchasePrice),
      organizationId,
      branchId
    });
    await productPrice.save({ session: s });

    // 6. Create Opening StockMovement
    if (Number(quantity) >= 0) {
      const stockMovement = new StockMovement({
        movementType: 'IN',
        productId: product._id,
        warehouseId: warehouse._id,
        quantity: Number(quantity),
        reason: 'Initial Stock',
        referenceType: 'OPENING_BALANCE',
        referenceId: product._id,
        organizationId,
        branchId
      });
      await stockMovement.save({ session: s });
    }

    if (session) {
      await session.commitTransaction();
      session.endSession();
    }

    return product;
  } catch (error) {
    if (session) {
      await session.abortTransaction();
      session.endSession();
    }
    throw error;
  }
};

/**
 * Updates a Product metadata.
 * Note: Quantity, purchase price, and selling price updates must be done via Receive Stock or Price Lists.
 * This is wrapped in a MongoDB transaction to ensure data consistency.
 */
exports.updateProduct = async ({ product, updates, branchId, organizationId, newSalePrice }) => {
  const client = mongoose.connection.getClient();
  const isReplicaSet = client.topology && (client.topology.description.type === 'ReplicaSetWithPrimary' || client.topology.description.type === 'ReplicaSetNoPrimary' || client.topology.description.type === 'Sharded');

  let session = null;
  if (isReplicaSet) {
    session = await mongoose.startSession();
    session.startTransaction();
  }
  const s = session || undefined;

  try {
    // 1. Update Product base fields
    // Ensure we do not accidentally overwrite legacy fields if they are sent by the frontend
    delete updates.quantity;
    delete updates.price;
    delete updates.purchasePrice;

    Object.assign(product, updates);

    // Update single source of truth for sale price
    if (newSalePrice !== undefined && newSalePrice !== null) {
      const salePrice = Number(newSalePrice);
      if (!Number.isFinite(salePrice) || salePrice < 0) {
        throw new Error("Invalid sale price");
      }
      
      if (!product.baseUnitId) {
        throw new Error("Product base unit is missing.");
      }
      
      let priceList = await PriceList.findOne({ 
        organizationId, 
        priceListCode: 'STD' 
      }).session(s);
      
      if (!priceList) {
        // Self-healing: Create Standard Price List if none exists globally for this org
        const createdLists = await PriceList.create([{
          name: 'Standard Price List',
          priceListCode: 'STD',
          priority: 1,
          isActive: true,
          organizationId,
          branchId
        }], { session: s });
        priceList = createdLists[0];
      } else if (!priceList.isActive) {
        priceList.isActive = true;
        await priceList.save({ session: s });
      }

      await ProductPrice.findOneAndUpdate(
        {
          productId: product._id,
          priceListId: priceList._id,
          organizationId
        },
        {
          $set: {
            price: salePrice
          },
          $setOnInsert: {
            unitId: product.baseUnitId,
            branchId,
            organizationId
          }
        },
        {
          upsert: true,
          new: true,
          session: s
        }
      );
    }

    await product.save({ session: s });

    if (session) {
      await session.commitTransaction();
      session.endSession();
    }

    return product;
  } catch (error) {
    if (session) {
      await session.abortTransaction();
      session.endSession();
    }
    throw error;
  }
};

/**
 * Maps a Product to a DTO with calculated price, purchasePrice, and quantity.
 * Also flattens populated fields (categoryId, brandId, etc.) into readable name fields.
 */
exports.toProductDTO = (product, priceRecord, stockQuantity) => {
  const productObj = product.toObject ? product.toObject() : { ...product };
  
  // Flatten populated references into readable name fields
  // After tenantPopulate, the field (e.g. categoryId) is either an object {_id, name} or null
  const extractName = (field) => {
    if (!field) return null;
    if (typeof field === 'object' && field.name) return field.name;
    return null;
  };
  const extractId = (field) => {
    if (!field) return null;
    if (typeof field === 'object' && field._id) return field._id;
    return field; // it's already a string ID
  };

  productObj.categoryName = extractName(productObj.categoryId);
  productObj.brandName = extractName(productObj.brandId);
  productObj.companyName = extractName(productObj.companyId);
  productObj.colorName = extractName(productObj.colorId);
  productObj.qualityName = extractName(productObj.qualityId);

  // Keep IDs as strings (not objects)
  productObj.categoryId = extractId(productObj.categoryId);
  productObj.brandId = extractId(productObj.brandId);
  productObj.companyId = extractId(productObj.companyId);
  productObj.colorId = extractId(productObj.colorId);
  productObj.qualityId = extractId(productObj.qualityId);

  if (priceRecord) {
    productObj.price = priceRecord.price;
    productObj.purchasePrice = priceRecord.costPrice || 0;
  }

  if (stockQuantity !== undefined && stockQuantity !== null) {
    productObj.quantity = stockQuantity;
  }

  return productObj;
};

/**
 * Fetches V3 data (ProductPrice and StockMovements) for a single product and maps to DTO.
 */
exports.mapProductWithV3Data = async (product, organizationId, branchId) => {
  const priceList = await PriceList.findOne({ organizationId, branchId, isActive: true }).sort({ priority: 1 });
  
  const priceQuery = priceList 
    ? { productId: product._id, priceListId: priceList._id, organizationId }
    : { productId: product._id, organizationId };

  const [priceRecord, stockAggr] = await Promise.all([
    ProductPrice.findOne(priceQuery).sort({ createdAt: -1 }),
    StockMovement.aggregate([
      { $match: { productId: product._id, organizationId } },
      {
        $group: {
          _id: "$productId",
          totalStock: {
            $sum: { $cond: [{ $eq: ["$movementType", "IN"] }, "$quantity", { $multiply: ["$quantity", -1] }] }
          }
        }
      }
    ])
  ]);

  const stockQuantity = stockAggr.length > 0 ? stockAggr[0].totalStock : 0;
  return exports.toProductDTO(product, priceRecord, stockQuantity);
};

/**
 * Fetches V3 data (ProductPrice and StockMovements) for an array of products and maps to DTO.
 */
exports.mapProductsWithV3Data = async (products, organizationId, branchId) => {
  if (!products || products.length === 0) return [];
  const productIds = products.map(p => p._id);

  const priceList = await PriceList.findOne({ organizationId, branchId, isActive: true }).sort({ priority: 1 });
  
  const priceQuery = priceList 
    ? { productId: { $in: productIds }, priceListId: priceList._id, organizationId }
    : { productId: { $in: productIds }, organizationId };

  const [prices, stockAggr] = await Promise.all([
    ProductPrice.find(priceQuery).sort({ createdAt: -1 }),
    StockMovement.aggregate([
      { $match: { productId: { $in: productIds }, organizationId } },
      {
        $group: {
          _id: "$productId",
          totalStock: {
            $sum: { $cond: [{ $eq: ["$movementType", "IN"] }, "$quantity", { $multiply: ["$quantity", -1] }] }
          }
        }
      }
    ])
  ]);

  const pricesByProduct = {};
  prices.forEach(p => {
    if (!pricesByProduct[p.productId]) {
      pricesByProduct[p.productId] = p; // take the latest for the active price list
    }
  });

  const stockByProduct = {};
  stockAggr.forEach(s => {
    stockByProduct[s._id] = s.totalStock;
  });

  return products.map(product => {
    const priceRecord = pricesByProduct[product._id];
    const stockQuantity = stockByProduct[product._id] || 0;
    return exports.toProductDTO(product, priceRecord, stockQuantity);
  });
};
