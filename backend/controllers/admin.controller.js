const Tenant = require("../models/Tenant");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

/**
 * Centralized Admin Query Wrapper
 * Safely grants SUPER_ADMIN context to Mongoose queries to bypass tenant guard.
 */
const adminQuery = (query) => query.setOptions({ context: { role: 'SUPER_ADMIN' }, skipTenantGuard: true });

/**
 * GET dashboard stats (V4 + legacy combined)
 */
exports.getDashboardStats = async (req, res) => {
  try {
    const { runInSystemContext } = require('../middleware/context/asyncContext');
    let result;
    await runInSystemContext(async () => {
      let Organization, Subscription, Branch;
      try { Organization = require('../models/Organization'); } catch (e) {}
      try { Subscription = require('../models/Subscription'); } catch (e) {}
      try { Branch = require('../models/Branch'); } catch (e) {}

      const [legacyTotal, legacyActive, pendingRequests, activeUsers] = await Promise.all([
        Tenant.countDocuments({ isDeleted: false }),
        Tenant.countDocuments({ status: 'active', isDeleted: false }),
        (async () => {
          try {
            const OrgReq = require('../models/OrganizationRequest');
            return await OrgReq.countDocuments({ status: 'PENDING' });
          } catch (e) { return 0; }
        })(),
        User.countDocuments({ status: 'active', isDeleted: false }).catch(() => 0),
      ]);

      let orgTotal = 0, orgActive = 0, shopTotal = 0, shopActive = 0, subActive = 0, subTrial = 0, subExpired = 0;

      if (Organization) {
        [orgTotal, orgActive] = await Promise.all([
          Organization.countDocuments({ isDeleted: false }).catch(() => 0),
          Organization.countDocuments({ status: 'ACTIVE', isDeleted: false }).catch(() => 0),
        ]);
      }
      if (Branch) {
        [shopTotal, shopActive] = await Promise.all([
          Branch.countDocuments({ isDeleted: false }).catch(() => 0),
          Branch.countDocuments({ status: 'ACTIVE', isDeleted: false }).catch(() => 0),
        ]);
      }
      if (Subscription) {
        const now = new Date();
        [subActive, subExpired] = await Promise.all([
          Subscription.countDocuments({ status: 'ACTIVE', expiresAt: { $gt: now } }).catch(() => 0),
          Subscription.countDocuments({ $or: [{ status: 'EXPIRED' }, { expiresAt: { $lt: now } }] }).catch(() => 0),
        ]);
      }

      result = {
        organizations: { total: orgTotal + legacyTotal, active: orgActive + legacyActive, suspended: 0 },
        shops: { total: shopTotal, active: shopActive },
        subscriptions: { active: subActive, trial: subTrial, expired: subExpired },
        revenue: { monthly: 0, today: 0 },
        requests: { pending: pendingRequests },
        users: { active: activeUsers },
      };
    });

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[DASHBOARD_STATS ERROR]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET pending tenants
 */
exports.getPendingTenants = async (req, res) => {
  try {
    const tenants = await Tenant.find({ status: "pending", isDeleted: false });
    console.log(`[PENDING_TENANTS SUCCESS] Found ${tenants.length} tenants`);
    res.json({
      success: true,
      data: tenants
    });
  } catch (err) {
    console.error("[PENDING_TENANTS CRITICAL ERROR]", {
      message: err.message,
      stack: err.stack,
      name: err.name
    });
    res.status(500).json({ 
      success: false, 
      message: err.message,
      name: err.name,
      stack: err.stack
    });
  }
};

/**
 * GET tenants by status
 */
exports.getTenants = async (req, res) => {
  try {
    const { runInSystemContext } = require('../middleware/context/asyncContext');
    await runInSystemContext(async () => {
      let Organization, User, Subscription;
      try { Organization = require('../models/Organization'); } catch (e) {}
      try { User = require('../models/User'); } catch (e) {}
      try { Subscription = require('../models/Subscription'); } catch (e) {}

      if (!Organization) {
        return res.json({ success: true, data: [] });
      }

      const { status } = req.query;
      
      // Fetch Legacy V3 Tenants
      const legacyFilter = { isDeleted: false };
      if (status) legacyFilter.status = status;
      const legacyTenants = await Tenant.find(legacyFilter).sort({ createdAt: -1 }).lean();

      // Fetch V4 Organizations
      const orgFilter = { isDeleted: false };
      // Support both lowercase ('active') and uppercase ('ACTIVE') status values
      if (status) orgFilter.status = { $regex: new RegExp(`^${status}$`, 'i') };
        let enrichedOrgs = [];
      
      if (Organization) {
        const orgs = await Organization.find(orgFilter).sort({ createdAt: -1 }).lean();
        
        let OrganizationRequest;
        try { OrganizationRequest = require('../models/OrganizationRequest'); } catch (e) {}

        enrichedOrgs = await Promise.all(orgs.map(async (org) => {
          let ownerEmail = '';
          let ownerPhone = '';
          let v1PlainPassword = '';
          
          if (User) {
            const owner = await User.findOne({ organizationId: org._id, role: 'OWNER' }).lean();
            if (owner) {
              ownerEmail = owner.email;
              ownerPhone = owner.phone;
              v1PlainPassword = owner.plainPassword;
              
              // Fallback to fetch tempPassword from OrganizationRequest for accounts created before plainPassword patch
              if (!v1PlainPassword && OrganizationRequest) {
                const req = await OrganizationRequest.findOne({ ownerId: owner._id }).lean();
                if (req && req.tempPassword) {
                  v1PlainPassword = req.tempPassword;
                }
              }
            }
          }
          
          let subEnd = null;
          let subPlan = 'CUSTOM';
          if (Subscription && org.subscriptionId) {
            const sub = await Subscription.findById(org.subscriptionId).lean();
            if (sub) {
              subEnd = sub.expiresAt;
              subPlan = sub.planId;
            }
          }

          return {
            _id: org._id,
            name: org.name,
            accountType: org.accountType, // Important for separating Shops vs Organizations
            businessType: org.businessType,
            status: org.status.toLowerCase(),
            ownerEmail,
            ownerPhone,
            v1PlainPassword,
            subscriptionPlan: subPlan,
            subscriptionEnd: subEnd,
            createdAt: org.createdAt
          };
        }));
      }

      // Combine both results
      const combinedTenants = [...enrichedOrgs, ...legacyTenants].sort((a, b) => {
        return new Date(b.createdAt) - new Date(a.createdAt);
      });

      res.json({ success: true, data: combinedTenants });
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * APPROVE tenant
 */
exports.approveTenant = async (req, res) => {
  try {
    const { 
      password, 
      subscriptionPlan, // Still accept this for legacy
      packageId,
      subscriptionPrice,
      durationType,
      durationValue,
      limits,
      enabledModules
    } = req.body;
    
    const { runInSystemContext } = require('../middleware/context/asyncContext');
    
    let admin;
    await runInSystemContext(async () => {
      admin = await User.findById(req.user._id).select('+password +passwordHash');
    });
    
    if (!admin) return res.status(401).json({ success: false, message: "Super Admin user not found in database" });

    const isMatch = await bcrypt.compare(password, admin.password || admin.passwordHash || "");
    if (!isMatch) return res.status(401).json({ success: false, message: "Invalid Super Admin password" });

    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return res.status(404).json({ success: false, message: "Tenant not found" });

    if (tenant.status !== "pending") {
      return res.status(400).json({ success: false, message: "Only pending tenants can be approved" });
    }

    const now = new Date();
    let end = new Date(now);
    
    // Legacy support
    if (subscriptionPlan === '15-day demo') end.setDate(end.getDate() + 15);
    else if (subscriptionPlan === '1 month') end.setMonth(end.getMonth() + 1);
    else if (subscriptionPlan === '1 year') end.setFullYear(end.getFullYear() + 1);
    else if (subscriptionPlan === '2 year') end.setFullYear(end.getFullYear() + 2);
    else if (subscriptionPlan === '3 year') end.setFullYear(end.getFullYear() + 3);

    tenant.subscriptionPlan = subscriptionPlan || 'Custom';
    tenant.subscriptionStart = now;
    tenant.subscriptionEnd = end;
    tenant.status = "active";
    tenant.approvedBy = req.user._id;
    tenant.approvedAt = now;

    await tenant.save();

    // Create V3 Subscription if packageId is provided
    if (packageId) {
      await runInSystemContext(async () => {
        const SubscriptionService = require('../services/subscriptionService');
        const svc = new SubscriptionService();
        await svc.createSubscription({
          ownerType: 'ORGANIZATION',
          ownerId: tenant._id,
          packageId,
          subscriptionPrice,
          durationType,
          durationValue,
          limits,
          enabledModules,
          startDate: now
        }, req.user._id);
      });
    }

    // Activate associated pending users (e.g. the Shop Admin who registered)
    await runInSystemContext(async () => {
      const User = require('../models/User');
      await User.updateMany(
        { tenantId: tenant._id, status: "pending" }, 
        { status: "active" }
      );

      // Auto-create default Master Data
      const Supplier = require('../models/Supplier');
      const defaultSupplier = await Supplier.findOne({ organizationId: tenant._id, name: 'Other' });
      if (!defaultSupplier) {
        await Supplier.create({
          name: 'Other',
          contactName: '-',
          phone: '-',
          status: 'active',
          organizationId: tenant._id,
          tenantId: tenant._id
        });
      }
    });

    const AuditLog = require('../models/AuditLog');
    await AuditLog.create({
      userId: req.user._id,
      tenantId: tenant._id,
      action: "TENANT_APPROVED",
      resource: "TENANT"
    });

    res.json({ success: true, message: "Tenant approved", data: tenant });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/**
 * REJECT tenant
 */
exports.rejectTenant = async (req, res) => {
  try {
    const { password, reason } = req.body;
    const { runInSystemContext } = require('../middleware/context/asyncContext');
    
    let admin;
    await runInSystemContext(async () => {
      admin = await User.findById(req.user._id).select('+password +passwordHash');
    });

    if (!admin) return res.status(401).json({ success: false, message: "Super Admin user not found in database" });

    const isMatch = await bcrypt.compare(password, admin.password || admin.passwordHash || "");
    if (!isMatch) return res.status(401).json({ success: false, message: "Invalid Super Admin password" });

    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return res.status(404).json({ success: false, message: "Tenant not found" });

    if (tenant.status !== "pending") {
      return res.status(400).json({ success: false, message: "Only pending tenants can be rejected" });
    }

    tenant.status = "rejected";
    await tenant.save();

    await runInSystemContext(async () => {
      await User.updateMany(
        { tenantId: tenant._id, status: "pending" }, 
        { status: "rejected" }
      );
    });

    await AuditLog.create({
      userId: req.user._id,
      tenantId: tenant._id,
      action: "TENANT_REJECTED",
      resource: "TENANT",
      metadata: { reason }
    });

    res.json({ success: true, message: "Tenant rejected" });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/**
 * SUSPEND tenant
 */
exports.suspendTenant = async (req, res) => {
  try {
    const { password } = req.body;
    const { runInSystemContext } = require('../middleware/context/asyncContext');
    
    let admin;
    await runInSystemContext(async () => {
      admin = await User.findById(req.user._id).select('+password +passwordHash');
    });

    if (!admin) return res.status(401).json({ success: false, message: "Super Admin user not found in database" });

    const isMatch = await bcrypt.compare(password, admin.password || admin.passwordHash || "");
    if (!isMatch) return res.status(401).json({ success: false, message: "Invalid Super Admin password" });

    let tenant = await Tenant.findById(req.params.id);
    let isOrg = false;
    if (!tenant) {
      const { runInSystemContext } = require('../middleware/context/asyncContext');
      await runInSystemContext(async () => {
        let Organization;
        try { Organization = require('../models/Organization'); } catch (e) {}
        if (Organization) {
          tenant = await Organization.findById(req.params.id);
          if (tenant) isOrg = true;
        }
      });
    }

    if (!tenant) return res.status(404).json({ success: false, message: "Tenant/Organization not found" });

    tenant.status = isOrg ? "SUSPENDED" : "suspended";
    tenant.suspendedBy = req.user._id;
    tenant.suspendedAt = new Date();
    await tenant.save();

    await adminQuery(User.updateMany({ tenantId: tenant._id }, { status: "suspended" }));

    await AuditLog.create({
      userId: req.user._id,
      tenantId: tenant._id,
      action: "TENANT_SUSPENDED",
      resource: "TENANT"
    });

    res.json({ success: true, message: "Tenant suspended" });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/**
 * RESTORE tenant
 */
exports.restoreTenant = async (req, res) => {
  try {
    const { password } = req.body;
    const { runInSystemContext } = require('../middleware/context/asyncContext');
    
    let admin;
    await runInSystemContext(async () => {
      admin = await User.findById(req.user._id).select('+password +passwordHash');
    });

    if (!admin) return res.status(401).json({ success: false, message: "Super Admin user not found in database" });

    const isMatch = await bcrypt.compare(password, admin.password || admin.passwordHash || "");
    if (!isMatch) return res.status(401).json({ success: false, message: "Invalid Super Admin password" });

    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return res.status(404).json({ success: false, message: "Tenant not found" });

    if (tenant.subscriptionEnd && tenant.subscriptionEnd < new Date()) {
      return res.status(400).json({ success: false, message: "Subscription expired. Renew tenant first." });
    }

    tenant.status = "active";
    await tenant.save();

    await runInSystemContext(async () => {
      await User.updateMany({ tenantId: tenant._id }, { status: "active" });
    });

    await AuditLog.create({
      userId: req.user._id,
      tenantId: tenant._id,
      action: "TENANT_RESTORED",
      resource: "TENANT"
    });

    res.json({ success: true, message: "Tenant restored" });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/**
 * UPDATE tenant (Edit fields: name, ownerEmail, ownerPhone, subscriptionPlan, subscriptionEnd, v1PlainPassword)
 */
exports.updateTenant = async (req, res) => {
  try {
    const { runInSystemContext } = require('../middleware/context/asyncContext');
    const { name, ownerEmail, ownerPhone, subscriptionPlan, subscriptionEnd, v1PlainPassword } = req.body;

    // Try V3 Tenant first
    let tenant = await Tenant.findById(req.params.id);
    let isOrg = false;

    if (!tenant) {
      // Try V4 Organization
      await runInSystemContext(async () => {
        let Organization;
        try { Organization = require('../models/Organization'); } catch (e) {}
        if (Organization) {
          tenant = await Organization.findById(req.params.id);
          if (tenant) isOrg = true;
        }
      });
    }

    if (!tenant) return res.status(404).json({ success: false, message: "Tenant/Organization not found" });

    // Apply editable fields
    if (name !== undefined) tenant.name = name;
    if (ownerEmail !== undefined) tenant.ownerEmail = ownerEmail;
    if (ownerPhone !== undefined) tenant.ownerPhone = ownerPhone;
    if (v1PlainPassword !== undefined) tenant.v1PlainPassword = v1PlainPassword;

    if (!isOrg) {
      // V3 Tenant - direct fields
      if (subscriptionPlan !== undefined) tenant.subscriptionPlan = subscriptionPlan;
      if (subscriptionEnd !== undefined) tenant.subscriptionEnd = subscriptionEnd ? new Date(subscriptionEnd) : null;
    } else {
      // V4 Organization - update subscription separately if provided
      if ((subscriptionEnd !== undefined) && tenant.subscriptionId) {
        await runInSystemContext(async () => {
          let Subscription;
          try { Subscription = require('../models/Subscription'); } catch (e) {}
          if (Subscription && tenant.subscriptionId) {
            await Subscription.findByIdAndUpdate(tenant.subscriptionId, {
              expiresAt: subscriptionEnd ? new Date(subscriptionEnd) : null
            });
          }
        });
      }
    }

    await tenant.save();

    // Also update owner user email/phone/password in V4
    if (isOrg && (ownerEmail || ownerPhone)) {
      await runInSystemContext(async () => {
        const UserModel = require('../models/User');
        const updates = {};
        if (ownerEmail) updates.email = ownerEmail;
        if (ownerPhone) updates.phone = ownerPhone;
        await UserModel.updateOne({ organizationId: tenant._id, role: 'OWNER' }, updates);
      });
    }

    await AuditLog.create({
      userId: req.user._id,
      tenantId: tenant._id,
      action: "TENANT_UPDATED",
      resource: "TENANT",
      metadata: { name, ownerEmail, ownerPhone, subscriptionPlan, subscriptionEnd }
    });

    res.json({ success: true, message: "Tenant updated successfully", data: tenant });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/**
 * DELETE tenant (Soft Delete)
 */
exports.deleteTenant = async (req, res) => {
  try {
    const { password } = req.body;
    const { runInSystemContext } = require('../middleware/context/asyncContext');
    
    let admin;
    await runInSystemContext(async () => {
      admin = await User.findById(req.user._id).select('+password +passwordHash');
    });

    if (!admin) return res.status(401).json({ success: false, message: "Super Admin user not found in database" });

    const isMatch = await bcrypt.compare(password, admin.password || admin.passwordHash || "");
    if (!isMatch) return res.status(401).json({ success: false, message: "Invalid Super Admin password" });

    let tenant = await Tenant.findById(req.params.id);
    if (!tenant && req.params.id.length === 24) {
      tenant = await Tenant.collection.findOne({ _id: new mongoose.Types.ObjectId(req.params.id) });
      if (tenant) {
        // Need to convert to Mongoose doc for .save()
        tenant = new Tenant(tenant);
        tenant.isNew = false;
      }
    }
    if (!tenant) return res.status(404).json({ success: false, message: "Tenant not found" });

    tenant.isDeleted = true;
    tenant.status = "deleted";
    await tenant.save();

    await adminQuery(User.updateMany({ tenantId: tenant._id }, { status: "suspended" }));

    await AuditLog.create({
      userId: req.user._id,
      tenantId: tenant._id,
      action: "TENANT_DELETED",
      resource: "TENANT"
    });

    res.json({ success: true, message: "Tenant soft deleted" });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/**
 * HARD DELETE tenant (Permanent Cascade Delete)
 */
exports.hardDeleteTenant = async (req, res) => {
  try {
    const { password } = req.body;
    const { runInSystemContext } = require('../middleware/context/asyncContext');
    
    let admin;
    await runInSystemContext(async () => {
      admin = await User.findById(req.user._id).select('+password +passwordHash');
    });

    if (!admin) return res.status(401).json({ success: false, message: "Super Admin user not found in database" });

    const isMatch = await bcrypt.compare(password, admin.password || admin.passwordHash || "");
    if (!isMatch) return res.status(401).json({ success: false, message: "Invalid Super Admin password" });

    let tenant = await Tenant.findById(req.params.id);
    let isObjectId = false;
    if (!tenant && req.params.id.length === 24) {
      tenant = await Tenant.collection.findOne({ _id: new mongoose.Types.ObjectId(req.params.id) });
      if (tenant) isObjectId = true;
    }
    
    // Check V4 Organization if not found in legacy Tenant
    if (!tenant) {
      const { runInSystemContext } = require('../middleware/context/asyncContext');
      await runInSystemContext(async () => {
        let Organization;
        try { Organization = require('../models/Organization'); } catch (e) {}
        if (Organization) {
          tenant = await Organization.findById(req.params.id);
        }
      });
    }

    if (!tenant) return res.status(404).json({ success: false, message: "Tenant/Organization not found" });

    const { hardDeleteTenantData } = require('../services/tenantCleanup.service');
    
    // Perform cascading hard delete
    const deletedCounts = await hardDeleteTenantData(isObjectId ? req.params.id : tenant._id.toString());

    // Create Audit Log (it won't be deleted since it's created after cleanup)
    await AuditLog.create({
      userId: req.user._id,
      action: "TENANT_HARD_DELETED",
      resource: "TENANT",
      metadata: { deletedTenantName: tenant.name, deletedCounts }
    });

    res.json({ success: true, message: "Tenant and all related data permanently deleted", data: deletedCounts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET all users
 */
exports.getUsers = async (req, res) => {
  const users = await adminQuery(User.find()).select("-password");

  res.json({
    success: true,
    data: users
  });
};

/**
 * GET pending shop admins
 */
exports.getPendingShopAdmins = async (req, res) => {
  try {
    const pendingAdmins = await adminQuery(User.find({
      status: "pending",
      role: "SHOP_ADMIN"
    })).select("-password");

    res.json({
      success: true,
      data: pendingAdmins
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET pending organization admins
 * // V2: Organization Admin is V2.
 */
exports.getPendingOrgAdmins = async (req, res) => {
  try {
    const pendingOrgAdmins = await adminQuery(User.find({
      status: "pending",
      role: "ORGANIZATION_ADMIN"
    })).select("-password");

    res.json({
      success: true,
      data: pendingOrgAdmins
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET dashboard stats
 */
exports.getDashboardStats = async (req, res) => {
  try {
    const { runInSystemContext } = require('../middleware/context/asyncContext');
    
    await runInSystemContext(async () => {
      let Branch, Subscription, OrganizationRequest, Organization;
      try { Branch = require('../models/Branch'); } catch (e) {}
      try { Subscription = require('../models/Subscription'); } catch (e) {}
      try { OrganizationRequest = require('../models/OrganizationRequest'); } catch (e) {}
      try { Organization = require('../models/Organization'); } catch (e) {}
      
      const [
        totalOrgs, activeOrgs, suspendedOrgs,
        totalShops, activeShops,
        activeSubs, trialSubs, expiredSubs,
        pendingRequests,
        activeUsers
      ] = await Promise.all([
        Organization ? Organization.countDocuments({ isDeleted: false }) : Promise.resolve(0),
        Organization ? Organization.countDocuments({ status: 'ACTIVE', isDeleted: false }) : Promise.resolve(0),
        Organization ? Organization.countDocuments({ status: 'SUSPENDED', isDeleted: false }) : Promise.resolve(0),
        
        Branch ? Branch.countDocuments({ isDeleted: false }).catch(() => 0) : Promise.resolve(0),
        Branch ? Branch.countDocuments({ status: 'ACTIVE', isDeleted: false }).catch(() => 0) : Promise.resolve(0),
        
        Subscription ? Subscription.countDocuments({ status: 'ACTIVE' }).catch(() => 0) : Promise.resolve(0),
        Subscription ? Subscription.countDocuments({ status: 'TRIAL' }).catch(() => 0) : Promise.resolve(0),
        Subscription ? Subscription.countDocuments({ status: 'EXPIRED' }).catch(() => 0) : Promise.resolve(0),
        
        OrganizationRequest ? OrganizationRequest.countDocuments({ status: 'PENDING' }).catch(() => 0) : Promise.resolve(0),
        
        User.countDocuments({ status: 'active' })
      ]);

      res.json({
        success: true,
        data: {
          organizations: {
            total: totalOrgs,
            active: activeOrgs,
            suspended: suspendedOrgs
          },
          shops: {
            total: totalShops,
            active: activeShops
          },
          subscriptions: {
            active: activeSubs,
            trial: trialSubs,
            expired: expiredSubs
          },
          revenue: {
            monthly: 0,
            today: 0
          },
          requests: {
            pending: pendingRequests
          },
          users: {
            active: activeUsers
          }
        }
      });
    });
  } catch (err) {
    console.error("[STATS CRITICAL ERROR]", {
      message: err.message,
      stack: err.stack,
      name: err.name
    });
    res.status(500).json({ 
      success: false, 
      message: err.message,
      name: err.name,
      stack: err.stack
    });
  }
};

/**
 * GET Audit Logs
 */
exports.getAuditLogs = async (req, res) => {
  try {
    const { tenantId, limit = 50, page = 1 } = req.query;
    const filter = {};
    if (tenantId) filter.tenantId = tenantId;

    const logs = await adminQuery(AuditLog.find(filter))
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('userId', 'name email role');

    const total = await adminQuery(AuditLog.countDocuments(filter));

    res.json({
      success: true,
      data: logs,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET tenant by id
 */
exports.getTenantById = async (req, res) => {
  try {
    const { runInSystemContext } = require('../middleware/context/asyncContext');
    let tenant, userCount, shopCount;

    await runInSystemContext(async () => {
      tenant = await Tenant.findById(req.params.id).populate("approvedBy", "name email").lean();
      if (!tenant) return;

      userCount = await User.countDocuments({ tenantId: tenant._id, isDeleted: false });
      
      let Shop;
      try { Shop = require('../models/Shop'); } catch (e) {}
      shopCount = Shop ? await Shop.countDocuments({ tenantId: tenant._id, isDeleted: false }).catch(() => 0) : 0;
    });

    if (!tenant) return res.status(404).json({ success: false, message: "Tenant not found" });

    res.json({ success: true, data: { ...tenant, userCount, shopCount } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * APPROVE user
 */
exports.approveUser = async (req, res) => {
  try {
    const { password } = req.body;
    const { runInSystemContext } = require('../middleware/context/asyncContext');
    
    let admin;
    await runInSystemContext(async () => {
      admin = await User.findById(req.user._id).select('+password +passwordHash');
    });

    if (!admin) return res.status(401).json({ success: false, message: "Super Admin user not found in database" });

    const isMatch = await bcrypt.compare(password, admin.password || admin.passwordHash || "");
    if (!isMatch) return res.status(401).json({ success: false, message: "Invalid Super Admin password" });

    const user = await adminQuery(User.findById(req.params.id));
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    user.status = "active";
    await user.save();

    await AuditLog.create({
      userId: req.user._id,
      action: "USER_APPROVED",
      resource: "USER",
      metadata: { approvedUserId: user._id }
    });

    res.json({ success: true, message: "User approved" });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/**
 * SUSPEND user
 */
exports.suspendUser = async (req, res) => {
  try {
    const { password } = req.body;
    const { runInSystemContext } = require('../middleware/context/asyncContext');
    
    let admin;
    await runInSystemContext(async () => {
      admin = await User.findById(req.user._id).select('+password +passwordHash');
    });

    if (!admin) return res.status(401).json({ success: false, message: "Super Admin user not found in database" });

    const isMatch = await bcrypt.compare(password, admin.password || admin.passwordHash || "");
    if (!isMatch) return res.status(401).json({ success: false, message: "Invalid Super Admin password" });

    const user = await adminQuery(User.findById(req.params.id));
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    user.status = "suspended";
    await user.save();

    await AuditLog.create({
      userId: req.user._id,
      action: "USER_SUSPENDED",
      resource: "USER",
      metadata: { suspendedUserId: user._id }
    });

    res.json({ success: true, message: "User suspended" });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/**
 * REJECT user
 */
exports.rejectUser = async (req, res) => {
  try {
    const { password, reason } = req.body;
    const { runInSystemContext } = require('../middleware/context/asyncContext');
    
    let admin;
    await runInSystemContext(async () => {
      admin = await User.findById(req.user._id).select('+password +passwordHash');
    });

    if (!admin) return res.status(401).json({ success: false, message: "Super Admin user not found in database" });

    const isMatch = await bcrypt.compare(password, admin.password || admin.passwordHash || "");
    if (!isMatch) return res.status(401).json({ success: false, message: "Invalid Super Admin password" });

    const user = await adminQuery(User.findById(req.params.id));
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    if (user.status !== "pending") {
      return res.status(400).json({ success: false, message: "Only pending users can be rejected" });
    }

    user.status = "rejected";
    await user.save();

    await AuditLog.create({
      userId: req.user._id,
      action: "USER_REJECTED",
      resource: "USER",
      metadata: { rejectedUserId: user._id, reason }
    });

    res.json({ success: true, message: "User rejected" });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};