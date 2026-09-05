const Supplier = require('../models/Supplier');
const LedgerEntry = require('../models/LedgerEntry');
const Order = require('../models/Order');
const Product = require('../models/Product');

// @desc    Create a new supplier
// @route   POST /api/suppliers
// @access  Private
exports.addSupplier = async (req, res) => {
  try {
    const { name, phone, companyName, email, address } = req.body;
    const shopId = req.user.shopId;

    if (!name || !phone) {
      return res.status(400).json({ success: false, message: "Name and phone are required" });
    }

    const existingSupplier = await Supplier.findOne({ tenantId: req.tenantId, phone });
    if (existingSupplier) {
      return res.status(400).json({ success: false, message: 'Supplier with this phone number already exists' });
    }

    const supplier = new Supplier({
      name,
      phone,
      companyName,
      email,
      address,
      shopId,
      tenantId: req.tenantId,
    });

    const savedSupplier = await supplier.save();
    res.status(201).json({
      success: true,
      message: "Supplier created successfully",
      data: savedSupplier,
    });
  } catch (error) {
    console.error('Create Supplier Error:', error);
    res.status(500).json({ success: false, message: 'Server error creating supplier', error: error.message });
  }
};

// @desc    Get all active suppliers for logged-in shop
// @route   GET /api/suppliers
// @access  Private
exports.getSuppliers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const suppliers = await Supplier.find({
      tenantId: req.tenantId,
      status: "active",
    })
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Supplier.countDocuments({
      tenantId: req.tenantId,
      status: "active",
    });

    res.status(200).json({
      success: true,
      message: "Suppliers fetched successfully",
      data: suppliers,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get Suppliers Error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching suppliers', error: error.message });
  }
};

// @desc    Search active suppliers by name, phone, or companyName
// @route   GET /api/suppliers/search
// @access  Private
exports.searchSuppliers = async (req, res) => {
  try {
    const { keyword } = req.query;

    let filter = {
      tenantId: req.tenantId,
      status: "active",
    };

    if (keyword) {
      filter.$or = [
        { name: { $regex: `^${keyword}`, $options: "i" } },
        { phone: { $regex: `^${keyword}`, $options: "i" } },
        { companyName: { $regex: `^${keyword}`, $options: "i" } }
      ];
    }

    const suppliers = await Supplier.find(filter).sort({ createdAt: -1 }).limit(50);

    res.json({
      success: true,
      data: suppliers,
    });
  } catch (error) {
    console.error('Search Suppliers Error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Update a supplier
// @route   PATCH /api/suppliers/:id
// @access  Private
exports.updateSupplier = async (req, res) => {
  try {
    const { name, phone, companyName, email, address, status } = req.body;
    const supplierId = req.params.id;

    const supplier = await Supplier.findOne({ _id: supplierId, tenantId: req.tenantId });

    if (!supplier) {
      return res.status(404).json({ success: false, message: 'Supplier not found' });
    }

    if (phone && phone !== supplier.phone) {
      const existingSupplier = await Supplier.findOne({ tenantId: req.tenantId, phone });
      if (existingSupplier) {
        return res.status(400).json({ success: false, message: 'Supplier with this phone number already exists' });
      }
    }

    supplier.name = name || supplier.name;
    supplier.phone = phone || supplier.phone;
    supplier.companyName = companyName !== undefined ? companyName : supplier.companyName;
    supplier.email = email !== undefined ? email : supplier.email;
    supplier.address = address !== undefined ? address : supplier.address;
    supplier.status = status || supplier.status;

    const updatedSupplier = await supplier.save();
    res.status(200).json({
      success: true,
      message: "Supplier updated successfully",
      data: updatedSupplier,
    });
  } catch (error) {
    console.error('Update Supplier Error:', error);
    res.status(500).json({ success: false, message: 'Server error updating supplier', error: error.message });
  }
};

// @desc    Delete a supplier (Soft Delete)
// @route   DELETE /api/suppliers/:id
// @access  Private
exports.deleteSupplier = async (req, res) => {
  try {
    const supplierId = req.params.id;

    const supplier = await Supplier.findOne({
      _id: supplierId,
      tenantId: req.tenantId,
    });

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
      });
    }

    supplier.status = "inactive";
    await supplier.save();

    res.status(200).json({
      success: true,
      message: "Supplier deactivated",
    });
  } catch (error) {
    console.error('Delete Supplier Error:', error);
    res.status(500).json({ success: false, message: 'Server error deleting supplier', error: error.message });
  }
};

// @desc    Get detailed supplier profile with stats
// @route   GET /api/suppliers/:id/detail
// @access  Private
exports.getSupplierDetail = async (req, res) => {
  try {
    const supplierId = req.params.id;

    const supplier = await Supplier.findOne({
      _id: supplierId,
      tenantId: req.tenantId,
    });

    if (!supplier) {
      return res.status(404).json({ success: false, message: 'Supplier not found' });
    }

    // Fetch recent ledger transactions instead of non-existent Purchase model
    const recentTransactions = await LedgerEntry.find({ 
      supplierId, 
      tenantId: req.tenantId,
      type: { $in: ['supplier_invoice', 'payment', 'supplier_payout'] }
    })
      .sort({ createdAt: -1 })
      .limit(5);

    const purchasesOnly = await LedgerEntry.find({
      supplierId,
      tenantId: req.tenantId,
      type: 'supplier_invoice'
    });

    const totalPurchases = purchasesOnly.reduce((sum, p) => sum + (p.amount || 0), 0);
    const purchaseCount = purchasesOnly.length;
    const recentPurchases = recentTransactions; // Sending recent ledger entries as recentPurchases for now

    const lastTransaction = recentTransactions.length > 0 ? recentTransactions[0] : null;

    res.status(200).json({
      success: true,
      data: {
        supplier,
        stats: {
          totalPurchases,
          payable: Math.abs(supplier.currentBalance || 0), // balance is negative if we owe them
          purchaseCount,
          lastTransactionDate: lastTransaction ? lastTransaction.createdAt : null,
          recentPurchases
        }
      }
    });
  } catch (error) {
    console.error('Get Supplier Detail Error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching supplier detail', error: error.message });
  }
};
