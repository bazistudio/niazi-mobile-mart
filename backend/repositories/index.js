const UserRepository = require('./auth/UserRepository');
const RoleRepository = require('./auth/RoleRepository');
const PermissionRepository = require('./auth/PermissionRepository');
const RolePermissionRepository = require('./auth/RolePermissionRepository');
const SessionRepository = require('./auth/SessionRepository');
const OtpVerificationRepository = require('./auth/OtpVerificationRepository');
const RoleMatrixRepository = require('./auth/RoleMatrixRepository');

const OrganizationRepository = require('./organization/OrganizationRepository');
const BranchRepository = require('./organization/BranchRepository');
const OrganizationMemberRepository = require('./organization/OrganizationMemberRepository');
const SubscriptionRepository = require('./organization/SubscriptionRepository');
const OrganizationRequestRepository = require('./organization/OrganizationRequestRepository');
const PackageRepository = require('./organization/PackageRepository');
const SubscriptionHistoryRepository = require('./organization/SubscriptionHistoryRepository');

const PaymentRequestRepository = require('./finance/PaymentRequestRepository');

const AuditLogRepository = require('./system/AuditLogRepository');

module.exports = {
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
};
