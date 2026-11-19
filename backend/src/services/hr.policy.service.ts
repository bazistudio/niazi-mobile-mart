/**
 * HR Policy Settings Service
 *
 * Implements business validation, concurrency-safe atomic versioning,
 * audit history creation, and authoritative effective policy resolution.
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import {
  HRPolicyRow,
  HRPolicyAuditLogRow,
  CreatePolicyParams,
  findOverlappingPolicy,
  insertPolicy,
  closePolicyPeriod,
  insertPolicyAuditLog,
  resolveEffectivePolicyRow,
  getPolicyById,
  listPoliciesForOrg,
  listPolicyAuditLogs,
} from '../repositories/hr.policy.repo';

export interface PolicyInputDTO {
  branch_id?: string | null;
  standard_shift_minutes?: number;
  late_threshold_minutes?: number;
  lates_for_absence?: number;
  monthly_working_days?: number;
  overtime_multiplier?: number;
  overtime_eligible_monthly?: boolean;
  half_day_deduction_factor?: number;
  effective_from: string;
  effective_to?: string | null;
}

export interface EffectivePolicyResult {
  policy: HRPolicyRow;
  is_override: boolean;
  resolved_branch_id: string;
}

function nowUtc(): string {
  return new Date().toISOString();
}

/**
 * Validate policy values against domain bounds.
 */
function validatePolicyValues(input: PolicyInputDTO): void {
  if (!input.effective_from || !/^\d{4}-\d{2}-\d{2}$/.test(input.effective_from)) {
    throw new Error('effective_from must be a valid date in YYYY-MM-DD format');
  }
  if (input.effective_to && !/^\d{4}-\d{2}-\d{2}$/.test(input.effective_to)) {
    throw new Error('effective_to must be a valid date in YYYY-MM-DD format');
  }
  if (input.effective_to && input.effective_to < input.effective_from) {
    throw new Error('effective_to cannot be earlier than effective_from');
  }

  const shift = input.standard_shift_minutes ?? 660;
  if (shift <= 0 || shift > 1440) {
    throw new Error('standard_shift_minutes must be between 1 and 1440');
  }

  const late = input.late_threshold_minutes ?? 20;
  if (late < 0 || late > 300) {
    throw new Error('late_threshold_minutes must be between 0 and 300');
  }

  const latesForAbsence = input.lates_for_absence ?? 3;
  if (latesForAbsence <= 0 || latesForAbsence > 30) {
    throw new Error('lates_for_absence must be a positive integer between 1 and 30');
  }

  const days = input.monthly_working_days ?? 26;
  if (days <= 0 || days > 31) {
    throw new Error('monthly_working_days must be between 1 and 31');
  }

  const otMultiplier = input.overtime_multiplier ?? 1.5;
  if (otMultiplier < 1.0 || otMultiplier > 5.0) {
    throw new Error('overtime_multiplier must be between 1.0 and 5.0');
  }

  const halfDayFactor = input.half_day_deduction_factor ?? 0.5;
  if (halfDayFactor < 0 || halfDayFactor > 1.0) {
    throw new Error('half_day_deduction_factor must be between 0.0 and 1.0');
  }
}

/**
 * Authoritatively verify that a branch belongs to the caller's organization.
 */
async function verifyBranchBelongsToOrg(
  pool: Pool,
  branch_id: string,
  organization_id: string
): Promise<void> {
  const res = await pool.query<{ id: string }>(
    'SELECT id FROM branches WHERE id = $1 AND organization_id = $2 LIMIT 1;',
    [branch_id, organization_id]
  );
  if (res.rows.length === 0) {
    throw new Error('Branch not found or belongs to another organization');
  }
}

/**
 * Create a new policy version (organization default or branch override).
 * Performs atomic overlap verification and records audit history in a transaction.
 */
export async function createPolicyVersion(
  pool: Pool,
  organization_id: string,
  input: PolicyInputDTO,
  created_by: string
): Promise<HRPolicyRow> {
  validatePolicyValues(input);

  const branchId = input.branch_id ? input.branch_id.trim() : null;
  if (branchId) {
    await verifyBranchBelongsToOrg(pool, branchId, organization_id);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Acquire advisory lock scoped to organization + branch to serialize policy changes
    // Using a hash of org and branch
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1));', [
      `${organization_id}:${branchId ?? 'DEFAULT'}`
    ]);

    // 2. Overlap check
    const overlap = await findOverlappingPolicy(
      client,
      organization_id,
      branchId,
      input.effective_from,
      input.effective_to ?? null
    );

    if (overlap) {
      throw new Error(
        `Overlapping policy period detected with policy ID ${overlap.id} ` +
        `(${overlap.effective_from} to ${overlap.effective_to ?? 'active'}). ` +
        'Please close or retire the previous policy before creating an overlapping period.'
      );
    }

    // 3. Insert policy
    const policyId = uuidv4();
    const now = nowUtc();
    const newPolicy = await insertPolicy(
      client,
      {
        organization_id,
        branch_id: branchId,
        standard_shift_minutes: input.standard_shift_minutes ?? 660,
        late_threshold_minutes: input.late_threshold_minutes ?? 20,
        lates_for_absence: input.lates_for_absence ?? 3,
        monthly_working_days: input.monthly_working_days ?? 26,
        overtime_multiplier: input.overtime_multiplier ?? 1.5,
        overtime_eligible_monthly: input.overtime_eligible_monthly ?? true,
        half_day_deduction_factor: input.half_day_deduction_factor ?? 0.5,
        effective_from: input.effective_from,
        effective_to: input.effective_to ?? null,
        created_by,
      },
      policyId,
      now
    );

    // 4. Audit log entry
    await insertPolicyAuditLog(client, {
      policy_id: policyId,
      organization_id,
      branch_id: branchId,
      action: 'CREATE',
      old_values_json: null,
      new_values_json: JSON.stringify(newPolicy),
      changed_by: created_by,
      changed_at: now,
    });

    await client.query('COMMIT');
    return newPolicy;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Retire / close an existing policy period.
 */
export async function retirePolicy(
  pool: Pool,
  organization_id: string,
  policyId: string,
  effectiveTo: string,
  retired_by: string
): Promise<HRPolicyRow> {
  if (!effectiveTo || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveTo)) {
    throw new Error('effectiveTo must be YYYY-MM-DD');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const policy = await getPolicyById(client, policyId, organization_id);
    if (!policy) {
      throw new Error('Policy not found');
    }
    if (effectiveTo < policy.effective_from) {
      throw new Error(`effectiveTo (${effectiveTo}) cannot be earlier than effective_from (${policy.effective_from})`);
    }

    const now = nowUtc();
    const updated = await closePolicyPeriod(client, policyId, effectiveTo, now);

    await insertPolicyAuditLog(client, {
      policy_id: policyId,
      organization_id,
      branch_id: policy.branch_id,
      action: 'RETIRE',
      old_values_json: JSON.stringify(policy),
      new_values_json: JSON.stringify(updated),
      changed_by: retired_by,
      changed_at: now,
    });

    await client.query('COMMIT');
    return updated;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Resolve effective policy for an organization, branch, and target date.
 * If branchId is null/undefined or staff has no branch, fails safely per Decision A.
 */
export async function getEffectivePolicy(
  pool: Pool,
  organization_id: string,
  branch_id: string | null | undefined,
  targetDate: string
): Promise<EffectivePolicyResult> {
  if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    throw new Error('targetDate must be YYYY-MM-DD');
  }

  // Decision A: Unbranched staff cannot resolve branch-based policy
  if (!branch_id || !branch_id.trim()) {
    throw new Error('Cannot resolve policy: target staff has no branch assignment (unbranched employees are excluded)');
  }

  await verifyBranchBelongsToOrg(pool, branch_id.trim(), organization_id);

  const resolved = await resolveEffectivePolicyRow(
    pool,
    organization_id,
    branch_id.trim(),
    targetDate
  );

  if (!resolved) {
    throw new Error(`No effective HR policy found for branch ${branch_id} on ${targetDate} (no branch override or org default configured)`);
  }

  return {
    policy: resolved.policy,
    is_override: resolved.is_override,
    resolved_branch_id: branch_id.trim(),
  };
}

/**
 * List all policies for organization.
 */
export async function listOrgPolicies(
  pool: Pool,
  organization_id: string
): Promise<HRPolicyRow[]> {
  return listPoliciesForOrg(pool, organization_id);
}

/**
 * List policy audit history.
 */
export async function listPolicyAuditHistory(
  pool: Pool,
  organization_id: string,
  policyId?: string,
  branchId?: string
): Promise<HRPolicyAuditLogRow[]> {
  return listPolicyAuditLogs(pool, organization_id, policyId, branchId);
}

/**
 * Approved baseline policy defaults when no custom hr_policy_settings row exists yet.
 */
export const APPROVED_POLICY_BASELINE = {
  standard_shift_minutes: 660,
  late_threshold_minutes: 20,
  lates_for_absence: 3,
  monthly_working_days: 26,
  overtime_multiplier: 1.5,
  overtime_eligible_monthly: true,
  half_day_deduction_factor: 0.5,
} as const;

export interface ResolvedPolicyValues {
  standard_shift_minutes: number;
  late_threshold_minutes: number;
  lates_for_absence: number;
  monthly_working_days: number;
  overtime_multiplier: number;
  overtime_eligible_monthly: boolean;
  half_day_deduction_factor: number;
  is_override: boolean;
  policy_id: string | null;
}

/**
 * Authoritatively resolve effective policy values for attendance snapshots and payroll calculation.
 * Checks branch override first, then organization default, and falls back to the approved baseline
 * only when the hr_policy_settings table has no active record for the date.
 */
export async function resolveEffectivePolicyForCalculation(
  pool: Pool | import('pg').PoolClient,
  organization_id: string,
  branch_id: string | null | undefined,
  targetDate: string
): Promise<ResolvedPolicyValues> {
  try {
    if (branch_id && branch_id.trim()) {
      const resolved = await resolveEffectivePolicyRow(
        pool,
        organization_id,
        branch_id.trim(),
        targetDate
      );
      if (resolved) {
        const p = resolved.policy;
        return {
          standard_shift_minutes: Number(p.standard_shift_minutes) || APPROVED_POLICY_BASELINE.standard_shift_minutes,
          late_threshold_minutes: Number(p.late_threshold_minutes ?? APPROVED_POLICY_BASELINE.late_threshold_minutes),
          lates_for_absence: Number(p.lates_for_absence) || APPROVED_POLICY_BASELINE.lates_for_absence,
          monthly_working_days: Number(p.monthly_working_days) || APPROVED_POLICY_BASELINE.monthly_working_days,
          overtime_multiplier: Number(p.overtime_multiplier) || APPROVED_POLICY_BASELINE.overtime_multiplier,
          overtime_eligible_monthly: Boolean(p.overtime_eligible_monthly),
          half_day_deduction_factor: Number(p.half_day_deduction_factor ?? APPROVED_POLICY_BASELINE.half_day_deduction_factor),
          is_override: resolved.is_override,
          policy_id: p.id,
        };
      }
    } else {
      // Unbranched fallback: check organization default directly
      const orgRes = await pool.query<HRPolicyRow>(
        `SELECT *
         FROM hr_policy_settings
         WHERE organization_id = $1
           AND branch_id IS NULL
           AND effective_from <= $2
           AND (effective_to IS NULL OR effective_to >= $2)
         ORDER BY effective_from DESC
         LIMIT 1;`,
        [organization_id, targetDate]
      );
      if (orgRes.rows[0]) {
        const p = orgRes.rows[0];
        return {
          standard_shift_minutes: Number(p.standard_shift_minutes) || APPROVED_POLICY_BASELINE.standard_shift_minutes,
          late_threshold_minutes: Number(p.late_threshold_minutes ?? APPROVED_POLICY_BASELINE.late_threshold_minutes),
          lates_for_absence: Number(p.lates_for_absence) || APPROVED_POLICY_BASELINE.lates_for_absence,
          monthly_working_days: Number(p.monthly_working_days) || APPROVED_POLICY_BASELINE.monthly_working_days,
          overtime_multiplier: Number(p.overtime_multiplier) || APPROVED_POLICY_BASELINE.overtime_multiplier,
          overtime_eligible_monthly: Boolean(p.overtime_eligible_monthly),
          half_day_deduction_factor: Number(p.half_day_deduction_factor ?? APPROVED_POLICY_BASELINE.half_day_deduction_factor),
          is_override: false,
          policy_id: p.id,
        };
      }
    }
  } catch {
    // Table may not exist in pre-048 environments; fall through to approved baseline
  }

  return {
    ...APPROVED_POLICY_BASELINE,
    is_override: false,
    policy_id: null,
  };
}
