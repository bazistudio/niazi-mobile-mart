/**
 * Sales Analytics Service
 *
 * Enforces RBAC and assembles the analytics response.
 * ADMIN/OWNER/SUPER_ADMIN/MULTI_ADMIN → org-wide queries; branch_id is optional.
 * SHOP_ADMIN/MANAGER → branch_id is locked to identity.branch_id.
 * CASHIER/SALESMAN → access denied.
 */

import { Pool } from 'pg';
import { RequestIdentity, isOrgAdmin } from '../auth';
import {
  SaFilters,
  SaFullReport,
  SaOverviewData,
  SaProductRow,
  SaRepairSummary,
  SaMobileSummary,
  SaAnomaly,
  SaException,
  getAnalyticsOverview,
  getProductAnalytics,
  getRepairAnalytics,
  getMobileAnalytics,
  getReconciliationAnomalies,
  listExceptions,
  getFullReport,
} from '../repositories/sales_analytics.repo';

export class SalesAnalyticsServiceError extends Error {
  constructor(message: string, public readonly statusCode: number = 400) {
    super(message);
    this.name = 'SalesAnalyticsServiceError';
  }
}

function canAccessAnalytics(identity: RequestIdentity): boolean {
  if (!identity) return false;
  if (isOrgAdmin(identity)) return true;
  const r = String(identity.role || '').toUpperCase();
  return r === 'SHOP_ADMIN' || r === 'MANAGER' || r === 'ACCOUNTANT';
}

function resolveFilters(identity: RequestIdentity, raw: SaFilters): SaFilters {
  if (!canAccessAnalytics(identity)) {
    throw new SalesAnalyticsServiceError(
      'Access denied: Sales analytics requires Shop Admin or higher role',
      403
    );
  }
  // Normalise sentinel 'ALL' / 'all' to null for org-wide unscoped querying
  const rawBranch = raw.branch_id === 'ALL' || raw.branch_id === 'all' ? null : raw.branch_id;
  if (isOrgAdmin(identity)) {
    return { ...raw, branch_id: rawBranch };
  }
  // SHOP_ADMIN / MANAGER / ACCOUNTANT: enforce their assigned branch
  if (!identity.branch_id) {
    throw new SalesAnalyticsServiceError('Access denied: No branch assigned to your account', 403);
  }
  return { ...raw, branch_id: identity.branch_id };
}

function getOrgId(identity: RequestIdentity): string {
  return identity.organization_id || '00000000-0000-0000-0000-000000000001';
}

export async function saGetOverview(
  pool: Pool,
  identity: RequestIdentity,
  raw: SaFilters
): Promise<SaOverviewData> {
  const f = resolveFilters(identity, raw);
  return getAnalyticsOverview(pool, f);
}

export async function saGetProducts(
  pool: Pool,
  identity: RequestIdentity,
  raw: SaFilters
): Promise<SaProductRow[]> {
  const f = resolveFilters(identity, raw);
  return getProductAnalytics(pool, f);
}

export async function saGetRepairs(
  pool: Pool,
  identity: RequestIdentity,
  raw: SaFilters
): Promise<SaRepairSummary> {
  const f = resolveFilters(identity, raw);
  return getRepairAnalytics(pool, f);
}

export async function saGetMobiles(
  pool: Pool,
  identity: RequestIdentity,
  raw: SaFilters
): Promise<SaMobileSummary> {
  const f = resolveFilters(identity, raw);
  return getMobileAnalytics(pool, f);
}

export async function saGetReconciliation(
  pool: Pool,
  identity: RequestIdentity,
  raw: SaFilters
): Promise<SaAnomaly[]> {
  const f = resolveFilters(identity, raw);
  return getReconciliationAnomalies(pool, f);
}

export async function saGetExceptions(
  pool: Pool,
  identity: RequestIdentity,
  raw: SaFilters
): Promise<SaException[]> {
  const f = resolveFilters(identity, raw);
  const orgId = getOrgId(identity);
  return listExceptions(pool, orgId, f);
}

export async function saGetFullReport(
  pool: Pool,
  identity: RequestIdentity,
  raw: SaFilters
): Promise<SaFullReport> {
  const f = resolveFilters(identity, raw);
  const orgId = getOrgId(identity);
  return getFullReport(pool, orgId, f);
}
