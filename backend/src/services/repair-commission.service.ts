/**
 * Niazi Mobile Mart — Repair Mechanic Commission & Organization Profit Service
 *
 * Business Policy:
 *   The organization recovers its "protected sale value" first (sum of authoritative
 *   product sale prices × quantities for all catalog parts used in the repair).
 *   Only the remaining "commissionable amount" is shared between the organization
 *   and the mechanic according to the mechanic's HR commission configuration.
 *
 * Key design decisions:
 *   1. Authoritative org sale price is read from products.sale_price, NOT from
 *      repair_parts.price (which is a client-supplied snapshot).
 *   2. Labor charges (repair_jobs.labor_charges JSON array) have no authoritative
 *      product-linked sale price. They are excluded from the protected value and
 *      only contribute to netTotal. This is a documented gap — see DESIGN GAP below.
 *   3. Parts where product_id IS NULL (consumables added manually) use
 *      repair_parts.price as the protected value fallback, since there is no DB record.
 *   4. org_commission = floor(commissionable × orgPct / 100);
 *      mechanic_commission = commissionable − org_commission  (exact remainder).
 *      Sum always equals commissionable_amount exactly.
 *   5. If commissionable_amount = 0 or customer charge ≤ protected value, both
 *      shares are 0 and the shortfall is recorded.
 *   6. Missing, inactive, or non-COMMISSION_PERCENTAGE config → CalcStatus.NO_CONFIG.
 *      No commission is generated silently.
 *
 * DESIGN GAP — Labor charges:
 *   repair_jobs.labor_charges is a free-form JSON array ({ amount, description? }).
 *   No product_id reference exists; no authoritative org sale price can be derived.
 *   Task spec §4 forbids inventing a sale price or silently using purchase cost.
 *   These amounts are therefore NOT included in protected_org_value.
 *   A future schema change to link labor/service items to the products table
 *   would close this gap without changing the commission formula.
 */

import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CommissionCalcStatus =
  | 'CALCULATED'      // Commission successfully calculated and stored
  | 'NO_TECHNICIAN'   // Job has no technician_id — no commission applicable
  | 'NO_CONFIG'       // Technician has no active COMMISSION_PERCENTAGE config
  | 'SHORTFALL'       // Customer charge ≤ protected value; zero commissionable pool
  | 'ZERO_POOL';      // Commissionable amount is 0 exactly (charge = protected)

export interface CommissionCalcResult {
  /** UUID of the commission record inserted into repair_commission_records */
  commissionRecordId: string | null;
  status: CommissionCalcStatus;
  /** Final customer invoice amount (netTotal) used for the calculation */
  final_charge: number;
  /** Sum of (qty × authoritative products.sale_price) for catalog parts */
  protected_org_value: number;
  /** MAX(0, final_charge − protected_org_value) */
  commissionable_amount: number;
  /** Mechanic's share % (from HR config snapshot) */
  mechanic_pct: number;
  /** Organization's share % (100 − mechanic_pct) */
  org_pct: number;
  /** floor(commissionable × orgPct / 100) */
  org_commission: number;
  /** commissionable − org_commission */
  mechanic_commission: number;
  /** Shortfall if final_charge < protected_org_value */
  shortfall: number;
}

export interface CommissionInputs {
  repairJobId: string;
  branchId: string;
  organizationId: string;
  technicianId: string | null;
  invoiceNumber: string;
  netTotal: number;
  deliveredAt: string;
  performedBy: string | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Read authoritative org sale price for each repair part that has a product_id.
 * Falls back to repair_parts.price for parts without a product_id (manual/consumable).
 * Returns total protected value (integer PKR).
 */
async function computeProtectedOrgValue(
  client: PoolClient,
  repairJobId: string
): Promise<number> {
  // Single query: for catalog parts join products.sale_price; for manual parts use repair_parts.price.
  // COALESCE(p.sale_price, rp.price) gives the right fallback.
  const res = await client.query<{
    qty: string;
    unit_protected: string;
  }>(
    `SELECT
       rp.qty,
       COALESCE(p.sale_price, rp.price) AS unit_protected
     FROM repair_parts rp
     LEFT JOIN products p ON p.id = rp.product_id::TEXT
     WHERE rp.repair_job_id = $1`,
    [repairJobId]
  );

  return res.rows.reduce((sum, row) => {
    return sum + Number(row.qty) * Number(row.unit_protected);
  }, 0);
}

/**
 * Fetch the active COMMISSION_PERCENTAGE config for the given user.
 * Returns null if none found or if salary_type is not COMMISSION_PERCENTAGE.
 */
async function fetchMechanicCommissionPct(
  client: PoolClient,
  userId: string
): Promise<number | null> {
  const res = await client.query<{
    salary_type: string;
    commission_percentage: string | null;
  }>(
    `SELECT salary_type, commission_percentage
     FROM staff_salary_configs
     WHERE user_id = $1
       AND effective_to IS NULL
     LIMIT 1`,
    [userId]
  );

  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  if (row.salary_type !== 'COMMISSION_PERCENTAGE') return null;
  if (row.commission_percentage === null || row.commission_percentage === undefined) return null;

  const pct = Number(row.commission_percentage);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null;

  return pct;
}

// ---------------------------------------------------------------------------
// Core calculation (pure — no DB side effects, fully testable)
// ---------------------------------------------------------------------------

export interface CommissionCalculation {
  status: CommissionCalcStatus;
  protected_org_value: number;
  commissionable_amount: number;
  mechanic_pct: number;
  org_pct: number;
  org_commission: number;
  mechanic_commission: number;
  shortfall: number;
}

/**
 * Pure calculation function — no DB access, fully unit-testable.
 *
 * @param finalCharge   Net invoice total (whole PKR)
 * @param protectedValue Sum of (qty × authoritative sale price) for all parts
 * @param mechanicPct   Mechanic's configured commission percentage (0–100)
 */
export function calculateCommission(
  finalCharge: number,
  protectedValue: number,
  mechanicPct: number
): CommissionCalculation {
  // Validate inputs
  if (!Number.isFinite(finalCharge) || finalCharge < 0)
    throw new Error(`calculateCommission: invalid finalCharge ${finalCharge}`);
  if (!Number.isFinite(protectedValue) || protectedValue < 0)
    throw new Error(`calculateCommission: invalid protectedValue ${protectedValue}`);
  if (!Number.isFinite(mechanicPct) || mechanicPct < 0 || mechanicPct > 100)
    throw new Error(`calculateCommission: invalid mechanicPct ${mechanicPct}`);

  const orgPct = 100 - mechanicPct;
  const shortfall = Math.max(0, protectedValue - finalCharge);
  const commissionable = Math.max(0, finalCharge - protectedValue);

  if (commissionable === 0) {
    const status: CommissionCalcStatus = shortfall > 0 ? 'SHORTFALL' : 'ZERO_POOL';
    return {
      status,
      protected_org_value: protectedValue,
      commissionable_amount: 0,
      mechanic_pct: mechanicPct,
      org_pct: orgPct,
      org_commission: 0,
      mechanic_commission: 0,
      shortfall,
    };
  }

  // Integer-safe: org gets floor, mechanic gets exact remainder
  // This ensures org_commission + mechanic_commission === commissionable exactly.
  const orgCommission = Math.floor((commissionable * orgPct) / 100);
  const mechanicCommission = commissionable - orgCommission;

  return {
    status: 'CALCULATED',
    protected_org_value: protectedValue,
    commissionable_amount: commissionable,
    mechanic_pct: mechanicPct,
    org_pct: orgPct,
    org_commission: orgCommission,
    mechanic_commission: mechanicCommission,
    shortfall: 0,
  };
}

// ---------------------------------------------------------------------------
// DB integration — called inside completeRepairJobTx transaction
// ---------------------------------------------------------------------------

/**
 * Calculate and persist the mechanic commission record for a completed repair job.
 *
 * MUST be called with an already-open transaction client BEFORE COMMIT.
 * The advisory lock keyed to `repair_delivery:${jobId}` in completeRepairJobTx
 * provides the first concurrency guard. The UNIQUE(repair_job_id) constraint
 * on repair_commission_records provides the final idempotency guard.
 *
 * @returns CommissionCalcResult — always returns a result; never throws for
 *   "no config" / shortfall / zero-pool — those are recorded as status entries.
 *   Throws only on hard DB errors.
 */
export async function calculateAndPersistCommission(
  client: PoolClient,
  inputs: CommissionInputs
): Promise<CommissionCalcResult> {
  const {
    repairJobId,
    branchId,
    organizationId,
    technicianId,
    invoiceNumber,
    netTotal,
    deliveredAt,
    performedBy,
  } = inputs;

  const base: Omit<CommissionCalcResult, 'commissionRecordId'> = {
    status: 'NO_TECHNICIAN',
    final_charge: netTotal,
    protected_org_value: 0,
    commissionable_amount: 0,
    mechanic_pct: 0,
    org_pct: 0,
    org_commission: 0,
    mechanic_commission: 0,
    shortfall: 0,
  };

  // ── Guard: no technician ───────────────────────────────────────────────────
  if (!technicianId) {
    const recordId = await persistCommissionRecord(client, {
      repairJobId,
      branchId,
      organizationId,
      technicianId: null,
      invoiceNumber,
      netTotal,
      mechanicPct: 0,
      orgPct: 0,
      calc: { ...base, status: 'NO_TECHNICIAN' },
      deliveredAt,
      performedBy,
    });
    return { commissionRecordId: recordId, ...base, status: 'NO_TECHNICIAN' };
  }

  // ── Fetch mechanic commission percentage ───────────────────────────────────
  const mechanicPct = await fetchMechanicCommissionPct(client, technicianId);
  if (mechanicPct === null) {
    const recordId = await persistCommissionRecord(client, {
      repairJobId,
      branchId,
      organizationId,
      technicianId,
      invoiceNumber,
      netTotal,
      mechanicPct: 0,
      orgPct: 0,
      calc: { ...base, status: 'NO_CONFIG' },
      deliveredAt,
      performedBy,
    });
    return { commissionRecordId: recordId, ...base, status: 'NO_CONFIG' };
  }

  // ── Compute protected org value from authoritative DB prices ───────────────
  const protectedOrgValue = await computeProtectedOrgValue(client, repairJobId);

  // ── Pure calculation ───────────────────────────────────────────────────────
  const calc = calculateCommission(netTotal, protectedOrgValue, mechanicPct);
  const orgPct = 100 - mechanicPct;

  // ── Persist ────────────────────────────────────────────────────────────────
  const recordId = await persistCommissionRecord(client, {
    repairJobId,
    branchId,
    organizationId,
    technicianId,
    invoiceNumber,
    netTotal,
    mechanicPct,
    orgPct,
    calc,
    deliveredAt,
    performedBy,
  });

  return {
    commissionRecordId: recordId,
    status: calc.status,
    final_charge: netTotal,
    protected_org_value: protectedOrgValue,
    commissionable_amount: calc.commissionable_amount,
    mechanic_pct: mechanicPct,
    org_pct: orgPct,
    org_commission: calc.org_commission,
    mechanic_commission: calc.mechanic_commission,
    shortfall: calc.shortfall,
  };
}

// ---------------------------------------------------------------------------
// Persistence helper
// ---------------------------------------------------------------------------

interface PersistArgs {
  repairJobId: string;
  branchId: string;
  organizationId: string;
  technicianId: string | null;
  invoiceNumber: string;
  netTotal: number;
  mechanicPct: number;
  orgPct: number;
  calc: CommissionCalculation | { status: CommissionCalcStatus; protected_org_value: number; commissionable_amount: number; mechanic_pct: number; org_pct: number; org_commission: number; mechanic_commission: number; shortfall: number };
  deliveredAt: string;
  performedBy: string | null;
}

async function persistCommissionRecord(
  client: PoolClient,
  args: PersistArgs
): Promise<string> {
  const id = uuidv4();
  const now = new Date().toISOString();

  await client.query(
    `INSERT INTO repair_commission_records (
       id,
       repair_job_id,
       branch_id,
       organization_id,
       technician_id,
       invoice_number,
       calc_status,
       final_charge,
       protected_org_value,
       commissionable_amount,
       mechanic_pct_snapshot,
       org_pct_snapshot,
       org_commission,
       mechanic_commission,
       shortfall,
       delivered_at,
       created_by,
       created_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
     )
     ON CONFLICT (repair_job_id) DO NOTHING`,
    [
      id,
      args.repairJobId,
      args.branchId,
      args.organizationId,
      args.technicianId,
      args.invoiceNumber,
      args.calc.status,
      args.netTotal,
      args.calc.protected_org_value,
      args.calc.commissionable_amount,
      args.mechanicPct,
      args.orgPct,
      args.calc.org_commission,
      args.calc.mechanic_commission,
      args.calc.shortfall,
      args.deliveredAt,
      args.performedBy,
      now,
    ]
  );

  return id;
}

// ---------------------------------------------------------------------------
// Pool-level convenience (for future admin/reporting endpoints)
// ---------------------------------------------------------------------------

export async function getCommissionRecordByJobId(
  pool: Pool,
  repairJobId: string
): Promise<Record<string, unknown> | null> {
  const res = await pool.query(
    `SELECT * FROM repair_commission_records WHERE repair_job_id = $1`,
    [repairJobId]
  );
  return res.rows[0] ?? null;
}
