const User = require('../models/User');
const Branch = require('../models/Branch');
const RoleMatrix = require('../models/RoleMatrix');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

// Helper to seed default matrix on shop creation if not exists
exports.seedDefaultRoles = async (shopId, tenantId) => {
  const roles = [
    {
      role: 'MANAGER',
      permissions: {
        POS_ACCESS: true, VIEW_PRODUCTS: true, CREATE_SALE: true, VIEW_LEDGER: true, VIEW_EXPENSES: true, CREATE_EXPENSE: true, VIEW_REPORTS: true, MANAGE_USERS: false, MANAGE_SETTINGS: false, DELETE_RECORDS: false, VIEW_INVENTORY: true
      }
    },
    {
      role: 'CASHIER',
      permissions: {
        POS_ACCESS: true, VIEW_PRODUCTS: true, CREATE_SALE: true, VIEW_LEDGER: false, VIEW_EXPENSES: false, CREATE_EXPENSE: false, VIEW_REPORTS: false, MANAGE_USERS: false, MANAGE_SETTINGS: false, DELETE_RECORDS: false, VIEW_INVENTORY: false
      }
    },
    {
      role: 'STAFF',
      permissions: {
        POS_ACCESS: true, VIEW_PRODUCTS: true, CREATE_SALE: false, VIEW_LEDGER: false, VIEW_EXPENSES: false, CREATE_EXPENSE: false, VIEW_REPORTS: false, MANAGE_USERS: false, MANAGE_SETTINGS: false, DELETE_RECORDS: false, VIEW_INVENTORY: true
      }
    }
  ];

  for (let r of roles) {
    await RoleMatrix.updateOne(
      { shopId, tenantId, role: r.role },
      { $setOnInsert: { shopId, tenantId, role: r.role, permissions: r.permissions } },
      { upsert: true }
    );
  }
};

// Get all staff for a shop
exports.getStaff = async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.tenantId;
    const shopId = req.user.shopId || req.shopId;

    const staff = await User.find({ shopId, tenantId, role: { $ne: 'SHOP_ADMIN' } })
      .select('-password -v1PlainPassword -resetPasswordToken -verificationToken');

    res.json(staff);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Create a new staff account (Manual MVP approach)
exports.createStaff = async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.tenantId;
    const shopId = req.user.shopId || req.shopId;
    const { name, email, password, role, phone } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: 'User already exists' });

    // Seed default roles if they don't exist yet for this shop
    await exports.seedDefaultRoles(shopId, tenantId);

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newStaff = await User.create({
      name,
      email,
      password: hashedPassword,
      v1PlainPassword: password, // For legacy support if needed
      role: role || 'CASHIER',
      status: 'active',
      shopId,
      tenantId,
      phone
    });

    res.status(201).json({
      _id: newStaff._id,
      name: newStaff.name,
      email: newStaff.email,
      role: newStaff.role,
      status: newStaff.status
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Update Staff (Status, Role)
exports.updateStaff = async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.tenantId;
    const shopId = req.user.shopId || req.shopId;
    const { id } = req.params;
    const { status, role } = req.body;

    const staff = await User.findOne({ _id: id, shopId, tenantId });
    if (!staff) return res.status(404).json({ message: 'Staff member not found' });

    if (status) staff.status = status;
    if (role) staff.role = role;

    await staff.save();

    res.json({
      _id: staff._id,
      name: staff.name,
      email: staff.email,
      role: staff.role,
      status: staff.status
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
