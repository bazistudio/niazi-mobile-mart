const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');
const Invoice = require('../models/Invoice');
const Order = require('../models/Order');
const tenantPopulate = require('../utils/tenantPopulate');
const productService = require('../services/productService');

/**
 * @desc    Global search across all main entities
 * @route   GET /api/search?query=...&limit=5&type=all
 * @access  Private
 */
exports.globalSearch = async (req, res) => {
  try {
    const { query: q, limit = 5, type = 'quick' } = req.query;
    
    // Fallback: Check if q exists (legacy) or query
    const rawQuery = q || req.query.q;
    const tenantId = req.tenantId;

    if (!tenantId) {
      return res.status(401).json({ success: false, message: "Tenant missing" });
    }

    if (!rawQuery || rawQuery.trim() === '') {
      return res.json({ success: true, data: { products: [], customers: [], suppliers: [], invoices: [] } });
    }

    const keyword = rawQuery.trim();
    // Escape special characters to prevent regex errors
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedKeyword, 'i');
    
    // Precompute startsWithRegex once to save O(n^2) regex compilations
    const startsWithRegex = new RegExp(`^${escapedKeyword}`, 'i');
    const exactRegex = new RegExp(`^${escapedKeyword}$`, 'i');
    
    const parsedLimit = parseInt(limit, 10) || 5;

    const results = {
      products: [],
      customers: [],
      suppliers: [],
      invoices: []
    };

    const promises = [];

    // Helper functions for scoring
    const getProductScore = (p) => {
      let score = 0;
      if (p.barcode === keyword) score += 100; // Exact Barcode match
      else if (p.barcode && p.barcode.includes(keyword)) score += 90;
      
      if (p.sku && exactRegex.test(p.sku)) score += 80;
      else if (p.sku && startsWithRegex.test(p.sku)) score += 70;
      else if (p.sku && p.sku.includes(keyword)) score += 60;
      
      if (exactRegex.test(p.name)) score += 50;
      else if (startsWithRegex.test(p.name)) score += 40;
      else score += 10;
      return score;
    };

    const getCustomerScore = (c) => {
      let score = 0;
      if (c.phone && c.phone.includes(keyword)) score += 80;
      if (exactRegex.test(c.name)) score += 50;
      else if (startsWithRegex.test(c.name)) score += 40;
      else score += 10;
      return score;
    };

    const getSupplierScore = (s) => {
      let score = 0;
      if (s.phone && s.phone.includes(keyword)) score += 80;
      if (exactRegex.test(s.name) || (s.companyName && exactRegex.test(s.companyName))) score += 50;
      else if (startsWithRegex.test(s.name) || (s.companyName && startsWithRegex.test(s.companyName))) score += 40;
      else score += 10;
      return score;
    };

    const getInvoiceScore = (i) => {
      let score = 0;
      const num = i.orderNumber || i.invoiceNumber || '';
      if (exactRegex.test(num)) score += 80;
      else if (startsWithRegex.test(num)) score += 70;
      else score += 10;
      return score;
    };

    // 1. PRODUCT SEARCH
    if (['all', 'quick', 'product'].includes(type)) {
      promises.push(
        Product.find({
          status: 'ACTIVE',
          $or: [
            { name: regex },
            { sku: regex },
            { barcode: regex }
          ]
        })
        .limit(parsedLimit)
        .populate(tenantPopulate('categoryId', 'name', tenantId))
        .lean()
        .then(async data => {
          // Hydrate with V3 dynamic prices and aggregated stock
          const shopId = req.user ? req.user.shopId : undefined;
          const hydratedData = await productService.mapProductsWithV3Data(data, tenantId, shopId);
          results.products = hydratedData.sort((a, b) => getProductScore(b) - getProductScore(a));
        })
      );
    }

    // 2. CUSTOMER SEARCH
    if (['all', 'customer'].includes(type)) {
      promises.push(
        Customer.find({
          status: 'ACTIVE',
          $or: [
            { name: regex },
            { phone: regex },
            { email: regex }
          ]
        })
        .limit(parsedLimit)
        .lean()
        .then(data => {
          results.customers = data.sort((a, b) => getCustomerScore(b) - getCustomerScore(a));
        })
      );
    }

    // 3. SUPPLIER SEARCH
    if (['all', 'supplier'].includes(type)) {
      promises.push(
        Supplier.find({
          status: 'ACTIVE',
          $or: [
            { name: regex },
            { companyName: regex },
            { phone: regex },
            { email: regex }
          ]
        })
        .limit(parsedLimit)
        .lean()
        .then(data => {
          results.suppliers = data.sort((a, b) => getSupplierScore(b) - getSupplierScore(a));
        })
      );
    }

    // 4. INVOICE / ORDER SEARCH
    if (['all', 'quick', 'invoice'].includes(type)) {
      promises.push(
        Promise.all([
          Invoice.find({
            tenantId,
            $or: [{ invoiceNumber: regex }]
          })
          .limit(parsedLimit)
          .populate(tenantPopulate('customerId', 'name', tenantId))
          .lean(),
          Order.find({
            organizationId: tenantId,
            $or: [{ orderNumber: regex }, { displayNumber: regex }]
          })
          .limit(parsedLimit)
          .populate({ path: 'partyId', select: 'companyName contactPerson', match: { organizationId: tenantId } })
          .lean()
        ]).then(([invoices, orders]) => {
          orders.forEach(o => {
            if (o.partyId) {
              o.customerId = { name: o.partyId.companyName || o.partyId.contactPerson || 'Walk-in' };
            }
            if (!o.orderNumber && o.displayNumber) {
              o.orderNumber = o.displayNumber; // Fallback for frontend
            }
          });
          const combined = [...invoices, ...orders];
          results.invoices = combined.sort((a, b) => getInvoiceScore(b) - getInvoiceScore(a)).slice(0, parsedLimit);
        })
      );
    }

    // Execute all queries in parallel
    await Promise.all(promises);

    res.json({
      success: true,
      data: results
    });

  } catch (error) {
    console.error('Global Search Error:', error);
    res.status(500).json({ success: false, message: 'Server error during global search', error: error.message });
  }
};
