const {
  UserRepository,
  RoleRepository,
  PermissionRepository,
  RolePermissionRepository,
  SessionRepository,
  OtpVerificationRepository,
  RoleMatrixRepository,
  OrganizationRepository,
  BranchRepository,
  OrganizationMemberRepository,
  SubscriptionRepository,
  OrganizationRequestRepository,
  PackageRepository,
  SubscriptionHistoryRepository,
  PaymentRequestRepository,
  AuditLogRepository
} = require('../repositories');

module.exports = {
  userRepository: new UserRepository(),
  roleRepository: new RoleRepository(),
  permissionRepository: new PermissionRepository(),
  rolePermissionRepository: new RolePermissionRepository(),
  sessionRepository: new SessionRepository(),
  otpVerificationRepository: new OtpVerificationRepository(),
  roleMatrixRepository: new RoleMatrixRepository(),
  organizationRepository: new OrganizationRepository(),
  branchRepository: new BranchRepository(),
  organizationMemberRepository: new OrganizationMemberRepository(),
  subscriptionRepository: new SubscriptionRepository(),
  organizationRequestRepository: new OrganizationRequestRepository(),
  packageRepository: new PackageRepository(),
  subscriptionHistoryRepository: new SubscriptionHistoryRepository(),
  paymentRequestRepository: new PaymentRequestRepository(),
  auditLogRepository: new AuditLogRepository()
};