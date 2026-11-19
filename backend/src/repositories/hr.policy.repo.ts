/**
 * HR Policy Settings Repository
 *
 * Provides transactional PostgreSQL queries for hr_policy_settings and
 * hr_policy_audit_log tables.
 *
 * Implements:
 * - Deterministic policy resolution with organization defaults and branch overrides
 * - Concurrency-safe effective-date overlap checking
 * - Atomic policy versioning and audit log recording
 */

import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';

export interface HRPolicyRow {
  id: string;
  organization_id: string;
  branch_id: string | null;
  standard_shift_minutes: number;
  late_threshold_minutes: number;
  lates_for_absence: number;
  monthly_working_days: number;
  overtime_multiplier: string;
  overtime_eligible_monthly: boolean;
  half_day_deduction_factor: string;
  effective_from: string;
  effective_to: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface HRPolicyAuditLogRow {
  id: string;
  policy_id: string;
  organization_id: string;
  branch_id: string | null;
  action: 'CREATE' | 'UPDATE' | 'RETIRE';
  old_values_json: string | null;
  new_values_json: string;
  changed_by: string;
  changed_at: string;
}

export interface CreatePolicyParams {
  organization_id: string;
  branch_id: string | null;
  standard_shift_minutes: number;
  late_threshold_minutes: number;
  lates_for_absence: number;
  monthly_working_days: number;
  overtime_multiplier: number;
  overtime_eligible_monthly: boolean;
  half_day_deduction_factor: number;
  effective_from: string;
  effective_to?: string | null;
  created_by: string;
}

/**
 * Check if an overlapping policy period exists for the given organization & branch.
 * Handles open-ended periods (effective_to IS NULL) safely.
 */
export async function findOverlappingPolicy(
  client: PoolClient | Pool,
  organization_id: string,
  branch_id: string | null,
  effective_from: string,
  effective_to: string | null,
  excludePolicyId?: string
): Promise<HRPolicyRow | null> {
  const branchCondition = branch_id === null ? 'branch_id IS NULL' : 'branch_id = $2';
  const params: unknown[] = [organization_id];
  if (branch_id !== null) params.push(branch_id);

  const fromParamIdx = params.length + 1;
  params.push(effective_from);
  const toParamIdx = params.length + 1;
  params.push(effective_to);

  let excludeClause = '';
  if (excludePolicyId) {
    const excludeIdx = params.length + 1;
    params.push(excludePolicyId);
    excludeClause = ` AND id != $${excludeIdx}`;
  }

  // Overlap condition between [A_start, A_end] and [B_start, B_end]:
  // A_start <= B_end AND (A_end IS NULL OR A_end >= B_start)
  // where A is existing row, B is candidate
  const query = `
    SELECT *
    FROM hr_policy_settings
    WHERE organization_id = $1
      AND ${branchCondition}
      ${excludeClause}
      AND (effective_to IS NULL OR effective_to >= $${fromParamIdx})
      AND ($${toParamIdx}::text IS NULL OR effective_from <= $${toParamIdx})
    LIMIT 1;
  `;

  const res = await client.query<HRPolicyRow>(query, params);
  return res.rows[0] ?? null;
}

/**
 * Insert a new policy record inside a client transaction.
 */
export async function insertPolicy(
  client: PoolClient,
  params: CreatePolicyParams,
  id: string,
  nowUtc: string
): Promise<HRPolicyRow> {
  const query = `
    INSERT INTO hr_policy_settings (
      id, organization_id, branch_id,
      standard_shift_minutes, late_threshold_minutes, lates_for_absence,
      monthly_working_days, overtime_multiplier, overtime_eligible_monthly,
      half_day_deduction_factor, effective_from, effective_to,
      created_by, created_at, updated_at
    ) VALUES (
      $1, $2, $3,
      $4, $5, $6,
      $7, $8, $9,
      $10, $11, $12,
      $13, $14, $14
    )
    RETURNING *;
  `;

  const res = await client.query<HRPolicyRow>(query, [
    id,
    params.organization_id,
    params.branch_id,
    params.standard_shift_minutes,
    params.late_threshold_minutes,
    params.lates_for_absence,
    params.monthly_working_days,
    params.overtime_multiplier,
    params.overtime_eligible_monthly,
    params.half_day_deduction_factor,
    params.effective_from,
    params.effective_to ?? null,
    params.created_by,
    nowUtc,
  ]);

  return res.rows[0];
}

/**
 * Retire / close an existing policy period by setting its effective_to date.
 */
export async function closePolicyPeriod(
  client: PoolClient,
  policyId: string,
  effectiveTo: string,
  nowUtc: string
): Promise<HRPolicyRow> {
  const query = `
    UPDATE hr_policy_settings
    SET effective_to = $1, updated_at = $2
    WHERE id = $3
    RETURNING *;
  `;
  const res = await client.query<HRPolicyRow>(query, [effectiveTo, nowUtc, policyId]);
  return res.rows[0];
}

/**
 * Insert an immutable audit log record.
 */
export async function insertPolicyAuditLog(
  client: PoolClient,
  params: {
    policy_id: string;
    organization_id: string;
    branch_id: string | null;
    action: 'CREATE' | 'UPDATE' | 'RETIRE';
    old_values_json: string | null;
    new_values_json: string;
    changed_by: string;
    changed_at: string;
  }
): Promise<HRPolicyAuditLogRow> {
  const id = uuidv4();
  const query = `
    INSERT INTO hr_policy_audit_log (
      id, policy_id, organization_id, branch_id,
      action, old_values_json, new_values_json,
      changed_by, changed_at
    ) VALUES (
      $1, $2, $3, $4,
      $5, $6, $7,
      $8, $9
    )
    RETURNING *;
  `;

  const res = await client.query<HRPolicyAuditLogRow>(query, [
    id,
    params.policy_id,
    params.organization_id,
    params.branch_id,
    params.action,
    params.old_values_json,
    params.new_values_json,
    params.changed_by,
    params.changed_at,
  ]);

  return res.rows[0];
}

/**
 * Authoritatively resolve the active policy for an organization, branch, and target date.
 * First checks branch override, then falls back to organization default.
 */
export async function resolveEffectivePolicyRow(
  pool: Pool | PoolClient,
  organization_id: string,
  branch_id: string,
  targetDate: string
): Promise<{ policy: HRPolicyRow; is_override: boolean } | null> {
  // 1. Try branch override first
  const branchOverrideQuery = `
    SELECT *
    FROM hr_policy_settings
    WHERE organization_id = $1
      AND branch_id = $2
      AND effective_from <= $3
      AND (effective_to IS NULL OR effective_to >= $3)
    ORDER BY effective_from DESC
    LIMIT 1;
  `;
  const branchRes = await pool.query<HRPolicyRow>(branchOverrideQuery, [
    organization_id,
    branch_id,
    targetDate,
  ]);

  if (branchRes.rows.length > 0) {
    return { policy: branchRes.rows[0], is_override: true };
  }

  // 2. Fall back to organization default (branch_id IS NULL)
  const orgDefaultQuery = `
    SELECT *
    FROM hr_policy_settings
    WHERE organization_id = $1
      AND branch_id IS NULL
      AND effective_from <= $2
      AND (effective_to IS NULL OR effective_to >= $2)
    ORDER BY effective_from DESC
    LIMIT 1;
  `;
  const orgRes = await pool.query<HRPolicyRow>(orgDefaultQuery, [
    organization_id,
    targetDate,
  ]);

  if (orgRes.rows.length > 0) {
    return { policy: orgRes.rows[0], is_override: false };
  }

  return null;
}

/**
 * Fetch a single policy by ID and organization.
 */
export async function getPolicyById(
  pool: Pool | PoolClient,
  policyId: string,
  organization_id: string
): Promise<HRPolicyRow | null> {
  const query = `
    SELECT *
    FROM hr_policy_settings
    WHERE id = $1 AND organization_id = $2
    LIMIT 1;
  `;
  const res = await pool.query<HRPolicyRow>(query, [policyId, organization_id]);
  return res.rows[0] ?? null;
}

/**
 * List all policies for an organization (defaults and branch overrides).
 */
export async function listPoliciesForOrg(
  pool: Pool,
  organization_id: string
): Promise<HRPolicyRow[]> {
  const query = `
    SELECT p.*, b.name as branch_name
    FROM hr_policy_settings p
    LEFT JOIN branches b ON b.id = p.branch_id
    WHERE p.organization_id = $1
    ORDER BY p.branch_id NULLS FIRST, p.effective_from DESC;
  `;
  const res = await pool.query<HRPolicyRow & { branch_name: string | null }>(query, [organization_id]);
  return res.rows;
}

/**
 * List audit history for a policy or entire organization.
 */
export async function listPolicyAuditLogs(
  pool: Pool,
  organization_id: string,
  policyId?: string,
  branchId?: string
): Promise<HRPolicyAuditLogRow[]> {
  let query = `
    SELECT l.*, u.name as changed_by_name
    FROM hr_policy_audit_log l
    LEFT JOIN users u ON u.id = l.changed_by
    WHERE l.organization_id = $1
  `;
  const params: unknown[] = [organization_id];

  if (policyId) {
    params.push(policyId);
    query += ` AND l.policy_id = $${params.length}`;
  }
  if (branchId) {
    params.push(branchId);
    query += ` AND l.branch_id = $${params.length}`;
  }

  query += ' ORDER BY l.changed_at DESC;';
  const res = await pool.query<HRPolicyAuditLogRow & { changed_by_name: string | null }>(query, params);
  return res.rows;
}
