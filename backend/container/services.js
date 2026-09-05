const repositories = require('./repositories');
const AuditLogService = require('../services/auditLogService');
const OrganizationService = require('../services/organizationService');
const SubscriptionService = require('../services/subscriptionService');
const NotificationService = require('../services/notificationService');
const AuthService = require('../services/auth/authService');
const OtpService = require('../services/otpService');
const OrganizationRequestService = require('../services/organizationRequestService');
const OrgMemberService = require('../services/orgMemberService');
const ShopService = require('../services/shop.service');
const RoleMatrixService = require('../services/roleMatrixService');
const PackageService = require('../services/packageService');
const PaymentRequestService = require('../services/paymentRequestService');
const PermissionService = require('../services/permissionService');
const RoleService = require('../services/roleService');

const auditLogService = new AuditLogService(repositories.auditLogRepository);

const subscriptionService = new SubscriptionService(
  repositories.subscriptionRepository,
  repositories.packageRepository,
  repositories.subscriptionHistoryRepository,
  repositories.paymentRequestRepository,
  repositories.organizationRepository,
  repositories.branchRepository,
  auditLogService,
  NotificationService
);

const roleService = new RoleService(
  repositories.roleRepository,
  repositories.rolePermissionRepository,
  repositories.permissionRepository
);

const organizationService = new OrganizationService(
  repositories.organizationRepository,
  repositories.organizationMemberRepository,
  auditLogService,
  subscriptionService,
  roleService
);

const authService = new AuthService(
  repositories.userRepository,
  repositories.sessionRepository,
  repositories.organizationMemberRepository,
  repositories.branchRepository,
  repositories.organizationRequestRepository,
  repositories.auditLogRepository,
  repositories.organizationRepository
);

const otpService = new OtpService(
  repositories.userRepository,
  repositories.otpVerificationRepository
);

const organizationRequestService = new OrganizationRequestService(
  repositories.organizationRequestRepository,
  repositories.organizationRepository,
  repositories.organizationMemberRepository,
  repositories.userRepository,
  repositories.branchRepository,
  repositories.sessionRepository,
  repositories.auditLogRepository,
  subscriptionService
);

const orgMemberService = new OrgMemberService(
  repositories.organizationMemberRepository,
  auditLogService
);

const shopService = new ShopService(
  repositories.branchRepository,
  auditLogService,
  subscriptionService
);

const packageService = new PackageService(
  repositories.packageRepository,
  auditLogService
);

const paymentRequestService = new PaymentRequestService(
  repositories.paymentRequestRepository,
  subscriptionService,
  auditLogService
);

const roleMatrixService = new RoleMatrixService(
  repositories.roleMatrixRepository
);

const permissionService = new PermissionService(
  repositories.permissionRepository
);

const organizationDashboardService = require('../services/organizationDashboardService');
const organizationLimitService = require('../services/organizationLimit.service');

module.exports = {
  auditLogService,
  subscriptionService,
  organizationService,
  authService,
  otpService,
  organizationRequestService,
  orgMemberService,
  shopService,
  packageService,
  paymentRequestService,
  roleMatrixService,
  permissionService,
  roleService,
  organizationDashboardService,
  organizationLimitService
};

