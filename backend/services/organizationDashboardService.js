const Organization = require('../models/Organization');
const Branch = require('../models/Branch');
const OrganizationMember = require('../models/OrganizationMember');
const AuditLog = require('../models/AuditLog');

class OrganizationDashboardService {
  async getDashboard(organizationId) {
    // Fetch all independent organization metrics concurrently
    const [
      organization,
      ownerMember,
      shopsCount,
      employeesCount,
      recentActivityDocs
    ] = await Promise.all([
      Organization.findById(organizationId).lean(),
      OrganizationMember.findOne({
        organizationId,
        $or: [{ role: 'OWNER' }, { isSystemOwner: true }],
        status: 'ACTIVE'
      })
        .populate({ path: 'userId', select: 'name email', options: { skipTenantGuard: true } })
        .lean(),
      Branch.countDocuments({ organizationId, isDeleted: false }),
      OrganizationMember.countDocuments({ organizationId }),
      AuditLog.find({ organizationId })
        .sort({ timestamp: -1 })
        .limit(10)
        .lean()
    ]);

    if (!organization) throw new Error('Organization not found');

    const ownerName = ownerMember?.userId?.name || 'Admin';

    const recentActivity = recentActivityDocs.map(log => ({
      action: log.action,
      details: log.details,
      date: log.timestamp
    }));

    return {
      organization: {
        name: organization.name || 'Niazi Mobile Mart',
        code: organization.code || 'NMM-HQ',
        owner: ownerName
      },
      subscription: null,
      shops: {
        current: shopsCount,
        limit: 'Unlimited'
      },
      employees: {
        total: employeesCount
      },
      sales: {
        today: 0,
        month: 0,
        total: 0
      },
      inventory: {
        lowStockProducts: 0
      },
      recentActivity
    };
  }
}

module.exports = new OrganizationDashboardService();
