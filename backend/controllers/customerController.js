const Customer = require('../models/Customer');
const Order = require('../models/Order');
const LedgerEntry = require('../models/LedgerEntry');
const Product = require('../models/Product');

// @desc    Create a new customer
// @route   POST /api/customers/add
// @access  Private
exports.addCustomer = async (req, res) => {
  try {
    const { name, phone, email, address, creditLimit } = req.body;
    const shopId = req.user.shopId;

    if (!name || !phone) {
      return res.status(400).json({ success: false, message: "Name and phone are required" });
    }

    const existingCustomer = await Customer.findOne({ organizationId: req.tenantId, phone });
    if (existingCustomer) {
      return res.status(400).json({ success: false, message: 'Customer with this phone number already exists' });
    }

    const customer = new Customer({
      name,
      phone,
      email,
      address,
      creditLimit: creditLimit !== undefined ? creditLimit : 100000,
      branchId: shopId,
      organizationId: req.tenantId,
    });

    const savedCustomer = await customer.save();
    res.status(201).json({
      success: true,
      message: "Customer created successfully",
      data: savedCustomer,
    });
  } catch (error) {
    console.error('Create Customer Error:', error);
    res.status(500).json({ success: false, message: 'Server error creating customer', error: error.message });
  }
};

// @desc    Get all active customers for logged-in shop
// @route   GET /api/customers/my-customers
// @access  Private
exports.getCustomers = async (req, res) => {
  try {
    const branchId = req.user.branchId || req.branchId || req.user.shopId || req.shopId;
    const isOrgAdminOrOwner = req.user.role === 'SUPER_ADMIN' || req.user.role === 'OWNER' || req.user.role === 'ADMIN' || req.user.isSystemOwner;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const query = {
      organizationId: req.tenantId,
      status: "ACTIVE",
    };

    if (!isOrgAdminOrOwner && branchId) {
      query.branchId = branchId;
    } else if (req.query.branchId || req.query.shopId) {
      query.branchId = req.query.branchId || req.query.shopId;
    }

    const customers = await Customer.find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Customer.countDocuments(query);

    res.status(200).json({
      success: true,
      message: "Customers fetched successfully",
      data: customers,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get Customers Error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching customers', error: error.message });
  }
};

// @desc    Search active customers by name or phone
// @route   GET /api/customers/search
// @access  Private
exports.searchCustomers = async (req, res) => {
  try {
    const shopId = req.user.shopId;
    const { keyword } = req.query;

    if (!keyword) {
      return res.status(400).json({
        success: false,
        message: "Search keyword is required",
      });
    }

    const customers = await Customer.find({
      organizationId: req.tenantId,
      status: "ACTIVE",
      $or: [
        { name: { $regex: `^${keyword}`, $options: "i" } },
        { phone: { $regex: `^${keyword}`, $options: "i" } }
      ]
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: customers,
    });
  } catch (error) {
    console.error('Search Customers Error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Update a customer
// @route   PUT /api/customers/update/:id
// @access  Private
exports.updateCustomer = async (req, res) => {
  try {
    const { name, phone, email, address, status, creditLimit } = req.body;
    const customerId = req.params.id;
    const shopId = req.user.shopId;

    const customer = await Customer.findOne({ _id: customerId, organizationId: req.tenantId });

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    if (phone && phone !== customer.phone) {
      const existingCustomer = await Customer.findOne({ organizationId: req.tenantId, phone });
      if (existingCustomer) {
        return res.status(400).json({ success: false, message: 'Customer with this phone number already exists' });
      }
    }

    customer.name = name || customer.name;
    customer.phone = phone || customer.phone;
    customer.email = email !== undefined ? email : customer.email;
    customer.address = address !== undefined ? address : customer.address;
    customer.status = status || customer.status;
    if (creditLimit !== undefined) {
      customer.creditLimit = creditLimit;
    }

    const updatedCustomer = await customer.save();
    res.status(200).json({
      success: true,
      message: "Customer updated successfully",
      data: updatedCustomer,
    });
  } catch (error) {
    console.error('Update Customer Error:', error);
    res.status(500).json({ success: false, message: 'Server error updating customer', error: error.message });
  }
};

// @desc    Delete a customer (Soft Delete)
// @route   DELETE /api/customers/delete/:id
// @access  Private
exports.deleteCustomer = async (req, res) => {
  try {
    const customerId = req.params.id;
    const shopId = req.user.shopId;

    const customer = await Customer.findOne({
      _id: customerId,
      organizationId: req.tenantId,
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    customer.status = "INACTIVE";
    await customer.save();

    res.status(200).json({
      success: true,
      message: "Customer deactivated",
    });
  } catch (error) {
    console.error('Delete Customer Error:', error);
    res.status(500).json({ success: false, message: 'Server error deleting customer', error: error.message });
  }
};

// @desc    Get detailed customer profile with stats
// @route   GET /api/customers/:id/detail
// @access  Private
exports.getCustomerDetail = async (req, res) => {
  try {
    const customerId = req.params.id;

    const customer = await Customer.findOne({
      _id: customerId,
      organizationId: req.tenantId,
    });

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    // Aggregate stats
    const orders = await Order.find({ customerId, organizationId: req.tenantId })
      .sort({ createdAt: -1 })
      .populate({
        path: 'items.productId',
        select: 'name',
        match: { organizationId: req.tenantId }
      })
      .select('orderNumber totalAmount status createdAt paymentMethod items discount tax');

    const totalSales = orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
    const invoiceCount = orders.length;
    const recentInvoices = orders.slice(0, 5);

    // Get last transaction date from Ledger
    const lastTransaction = await LedgerEntry.findOne({ customerId, organizationId: req.tenantId })
      .sort({ timestamp: -1 })
      .select('timestamp');

    res.status(200).json({
      success: true,
      data: {
        customer,
        stats: {
          totalSales,
          outstanding: customer.currentBalance || 0,
          invoiceCount,
          lastTransactionDate: lastTransaction ? lastTransaction.timestamp : null,
          recentInvoices
        }
      }
    });
  } catch (error) {
    console.error('Get Customer Detail Error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching customer detail', error: error.message });
  }
};
