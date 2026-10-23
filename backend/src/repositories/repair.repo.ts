/**
 * Repair Jobs PostgreSQL Repository
 * Phase A rewrite: atomic booking, stock deduction at part-commit,
 * cash-session-aware payments, repair-job-scoped settlement tracking.
 *
 * Business rules:
 *  - createRepairJobTx  — atomic booking (job + optional advance payment)
 *  - addRepairPartTx    — deduct stock at part-commit; compensating IN on remove
 *  - removeRepairPartTx — restore stock if stock_deducted = TRUE
 *  - addRepairPaymentTx — CASH: validate open session + cash_movement; non-CASH: record only
 *  - completeRepairJobTx — delivery: invoice counter, settle outstanding, status=DELIVERED
 *  - Repair jobs NEVER post to customer_ledger_entries or update customers.balance
 *  - Outstanding balance at delivery is tracked on the repair job (settlement_status='CREDIT'),
 *    not as customer-account debt
 *  - writeChangeLogEntry is called INSIDE each BEGIN…COMMIT — no setImmediate()
 *  - branch_id always derived from the persisted repair job, never from client body
 *  - All monetary values: whole PKR integers (BIGINT)
 */

import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { writeChangeLogEntry } from './change_log.repo';

// ─── DTOs ────────────────────────────────────────────────────────────────────

export interface DeviceInfoDto {
  type: string;
  brand: string;
  model: string;
  color?: string;
  imei?: string;
  password?: string;
}

export interface AccessoriesDto {
  charger?: boolean;
  battery?: boolean;
  sim?: boolean;
  memoryCard?: boolean;
  cover?: boolean;
  box?: boolean;
  other?: string;
}

export interface CreateRepairJobDto {
  customer_id?: string | null;
  customer_name: string;
  customer_phone?: string | null;
  device: DeviceInfoDto;
  accessories?: AccessoriesDto;
  problem_description: string;
  initial_inspection?: string[];
  technician_id?: string | null;
  priority?: 'Low' | 'Normal' | 'High' | 'Urgent';
  estimated_cost?: number;
  expected_delivery_date?: string | null;
  internal_notes?: string | null;
  customer_notes?: string | null;
  branch_id?: string | null;
  /** Optional advance payment at booking time */
  advance_payment?: {
    amount: number;
    method: string;
    reference?: string | null;
  } | null;
}

export interface UpdateRepairStatusDto {
  status: string;
  note?: string | null;
}

export interface AddRepairPartDto {
  product_id?: string | null;
  product_name: string;
  product_sku?: string;
  qty: number;
  cost: number;
  price: number;
}

export interface AddRepairPaymentDto {
  amount: number;
  method: string;
  reference?: string | null;
}

export interface CompleteRepairJobDto {
  /** Optional extra discount applied at delivery */
  discount?: number;
  /** Optional additional charges at delivery */
  additional_charges?: number;
  /** Payment at delivery for any outstanding balance */
  settlement_payment?: {
    amount: number;
    method: string;
    reference?: string | null;
  } | null;
  delivery_notes?: string | null;
}

export interface RepairJobFilters {
  status?: string;
  branch_id?: string;
  customer_id?: string;
  technician_id?: string;
  page?: number;
  limit?: number;
}

// ─── Error class ─────────────────────────────────────────────────────────────

export class RepairRepoError extends Error {
  constructor(message: string, public readonly statusCode: number = 400) {
    super(message);
    this.name = 'RepairRepoError';
  }
}

// ─── Shape returned from DB ──────────────────────────────────────────────────

function parseJsonField<T>(raw: unknown, fallback: T): T {
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as T; } catch { return fallback; }
  }
  if (Array.isArray(raw) || (typeof raw === 'object' && raw !== null)) {
    return raw as unknown as T;
  }
  return fallback;
}

function rowToRepairJob(row: Record<string, unknown>, parts: unknown[], payments: unknown[]) {
  const id = row['id'] as string;
  const partsTotal = (parts as Array<{ qty: number; price: number }>)
    .reduce((s, p) => s + (Number(p.qty) * Number(p.price)), 0);
  const laborCharges = parseJsonField<Array<{ amount: number }>>(row['labor_charges'], []);
  const laborTotal = laborCharges.reduce((s, l) => s + Number(l.amount ?? 0), 0);
  const grandTotal = partsTotal + laborTotal + Number(row['additional_charges'] ?? 0) - Number(row['discount'] ?? 0);
  const totalPaid = (payments as Array<{ amount: number }>).reduce((s, p) => s + Number(p.amount), 0);

  const warranty = row['warranty_period']
    ? {
        period: row['warranty_period'] as string,
        expiryDate: (row['warranty_expiry_date'] as string) || '',
        notes: (row['warranty_notes'] as string) || '',
        status: (row['warranty_status'] as string) || 'Active',
      }
    : undefined;

  return {
    id,
    _id: id,
    jobId: row['job_id'] as string,
    invoiceNumber: (row['invoice_number'] as string) || null,
    branch_id: (row['branch_id'] as string) || null,
    branchId: (row['branch_id'] as string) || null,
    settlementStatus: (row['settlement_status'] as string) || 'UNPAID',
    deliveredAt: (row['delivered_at'] as string) || null,
    deliveredBy: row['delivered_by'] || null,
    customerId: row['customer_id']
      ? { _id: row['customer_id'], name: row['customer_name'], phone: row['customer_phone'] }
      : { _id: null, name: row['customer_name'] as string, phone: row['customer_phone'] ?? '' },
    customerModel: 'Party' as const,
    device: {
      type: row['device_type'] as string,
      brand: row['device_brand'] as string,
      model: row['device_model'] as string,
      color: row['device_color'] as string,
      imei: row['device_imei'] as string,
      password: (row['device_password'] as string) || undefined,
    },
    accessories: {
      charger: Boolean(row['acc_charger']),
      battery: Boolean(row['acc_battery']),
      sim: Boolean(row['acc_sim']),
      memoryCard: Boolean(row['acc_memory_card']),
      cover: Boolean(row['acc_cover']),
      box: Boolean(row['acc_box']),
      other: (row['acc_other'] as string) || undefined,
    },
    problemDescription: row['problem_description'] as string,
    initialInspection: parseJsonField<string[]>(row['initial_inspection'], []),
    technicianId: row['technician_id']
      ? { _id: row['technician_id'], name: row['technician_name'] ?? '' }
      : undefined,
    priority: (row['priority'] as string) || 'Normal',
    estimatedCost: Number(row['estimated_cost'] ?? 0),
    expectedDeliveryDate: (row['expected_delivery_date'] as string) || undefined,
    status: row['status'] as string,
    timeline: parseJsonField<unknown[]>(row['timeline'], []),
    partsUsed: parts,
    laborCharges,
    additionalCharges: Number(row['additional_charges'] ?? 0),
    discount: Number(row['discount'] ?? 0),
    payments,
    internalNotes: (row['internal_notes'] as string) || undefined,
    customerNotes: (row['customer_notes'] as string) || undefined,
    images: {
      before: parseJsonField<string[]>(row['images_before'], []),
      after: parseJsonField<string[]>(row['images_after'], []),
      proof: parseJsonField<string[]>(row['images_proof'], []),
    },
    warranty,
    // Virtuals
    partsTotal,
    laborTotal,
    grandTotal,
    totalPaid,
    remainingBalance: grandTotal - totalPaid,
    createdAt: row['created_at'] as string,
    updatedAt: row['updated_at'] as string,
  };
}

// ─── Internal query helpers ───────────────────────────────────────────────────

/**
 * Read parts for a job scoped to the job's own branch_id (avoids cross-branch stock
 * by only showing org-wide stock for parts with a product_id, filtered by the job branch).
 */
async function getPartsForJob(pool: Pool, jobId: string, branchId?: string): Promise<unknown[]> {
  const res = await pool.query(
    `SELECT
       rp.id AS "_id",
       rp.product_id,
       rp.product_name,
       rp.product_sku,
       rp.qty,
       rp.cost,
       rp.price,
       rp.added_at,
       rp.stock_deducted,
       rp.stock_movement_id,
       COALESCE(s.quantity, 0) AS current_stock
     FROM repair_parts rp
     LEFT JOIN stock s ON s.product_id = rp.product_id
       AND s.branch_id = COALESCE(rp.branch_id, $2)
     WHERE rp.repair_job_id = $1
     ORDER BY rp.added_at ASC`,
    [jobId, branchId ?? null]
  );
  return res.rows.map((r: Record<string, unknown>) => ({
    _id: r['_id'],
    productId: r['product_id']
      ? {
          _id: r['product_id'],
          name: r['product_name'],
          sku: r['product_sku'] || '',
          currentStock: Number(r['current_stock'] ?? 0),
          cost: Number(r['cost']),
          price: Number(r['price']),
        }
      : null,
    qty: Number(r['qty']),
    cost: Number(r['cost']),
    price: Number(r['price']),
    stockDeducted: Boolean(r['stock_deducted']),
    stockMovementId: (r['stock_movement_id'] as string) || null,
    addedAt: r['added_at'] as string,
  }));
}

async function getPaymentsForJob(pool: Pool, jobId: string): Promise<unknown[]> {
  const res = await pool.query(
    `SELECT id AS "_id", amount, method, reference, session_id, cash_movement_id,
            branch_id, performed_by, created_at
     FROM repair_payments WHERE repair_job_id = $1 ORDER BY created_at ASC`,
    [jobId]
  );
  return res.rows.map((r: Record<string, unknown>) => ({
    _id: r['_id'],
    amount: Number(r['amount']),
    method: r['method'] as string,
    reference: (r['reference'] as string) || undefined,
    sessionId: (r['session_id'] as string) || null,
    cashMovementId: (r['cash_movement_id'] as string) || null,
    timestamp: r['created_at'] as string,
  }));
}

/**
 * Compute settlement status from net_total and valid payments.
 * Used for intermediate payment tracking (pre-delivery).
 * At delivery, completeRepairJobTx sets the final status explicitly:
 *   totalPaid >= netTotal  => 'PAID'
 *   totalPaid <  netTotal  => 'CREDIT'  (device delivered, balance outstanding on repair job)
 * NOTE: 'CREDIT' here means outstanding repair-job balance — no customer_ledger_entries are created.
 */
function computeSettlementStatus(netTotal: number, totalPaid: number): string {
  if (totalPaid <= 0 && netTotal > 0) return 'UNPAID';
  if (totalPaid >= netTotal) return 'PAID';
  return 'PARTIALLY_PAID';
}

// ─── Internal: cash movement INSERT inside a transaction ─────────────────────

async function insertCashMovement(
  client: PoolClient,
  opts: {
    sessionId: string;
    branchId: string;
    movementType: string;
    direction: 'IN' | 'OUT';
    amount: number;
    referenceId: string;
    referenceNumber: string | null;
    paymentMethod: string;
    description: string;
    performedBy: string | null;
    now: string;
  }
): Promise<string> {
  const cmId = uuidv4();
  await client.query(
    `INSERT INTO cash_movements (
       id, session_id, branch_id, movement_type, direction, amount,
       reference_id, reference_number, payment_method, description,
       performed_by, created_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      cmId, opts.sessionId, opts.branchId, opts.movementType, opts.direction,
      opts.amount, opts.referenceId, opts.referenceNumber, opts.paymentMethod,
      opts.description, opts.performedBy, opts.now,
    ]
  );
  return cmId;
}

// ─── Repository functions ─────────────────────────────────────────────────────

export async function listRepairJobs(
  pool: Pool,
  filters: RepairJobFilters
): Promise<{ data: unknown[]; total: number; page: number; limit: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (filters.status) {
    conditions.push(`rj.status = $${paramIdx++}`);
    params.push(filters.status);
  }
  if (filters.branch_id) {
    conditions.push(`rj.branch_id = $${paramIdx++}`);
    params.push(filters.branch_id);
  }
  if (filters.customer_id) {
    conditions.push(`rj.customer_id = $${paramIdx++}`);
    params.push(filters.customer_id);
  }
  if (filters.technician_id) {
    conditions.push(`rj.technician_id = $${paramIdx++}`);
    params.push(filters.technician_id);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRes = await pool.query(
    `SELECT COUNT(*) AS total FROM repair_jobs rj ${whereClause}`,
    params
  );
  const total = Number((countRes.rows[0] as Record<string, unknown>)?.['total'] ?? 0);

  const dataRes = await pool.query(
    `SELECT
       rj.*,
       u.name AS technician_name
     FROM repair_jobs rj
     LEFT JOIN users u ON u.id = rj.technician_id
     ${whereClause}
     ORDER BY rj.created_at DESC
     LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    [...params, limit, offset]
  );

  const data = await Promise.all(
    dataRes.rows.map(async (row: Record<string, unknown>) => {
      const branchId = (row['branch_id'] as string) || undefined;
      const parts = await getPartsForJob(pool, row['id'] as string, branchId);
      const payments = await getPaymentsForJob(pool, row['id'] as string);
      return rowToRepairJob(row, parts, payments);
    })
  );

  return { data, total, page, limit };
}

export async function getRepairJobById(pool: Pool, id: string): Promise<unknown | null> {
  const res = await pool.query(
    `SELECT rj.*, u.name AS technician_name
     FROM repair_jobs rj
     LEFT JOIN users u ON u.id = rj.technician_id
     WHERE rj.id::text = $1 OR rj.job_id = $1`,
    [id]
  );
  if (res.rows.length === 0) return null;
  const row = res.rows[0] as Record<string, unknown>;
  const branchId = (row['branch_id'] as string) || undefined;
  const parts = await getPartsForJob(pool, row['id'] as string, branchId);
  const payments = await getPaymentsForJob(pool, row['id'] as string);
  return rowToRepairJob(row, parts, payments);
}

// ─── A2: createRepairJobTx ────────────────────────────────────────────────────
/**
 * Atomically creates a repair job. If advance_payment is provided and method is CASH,
 * validates the open cash session for the job's branch and records a cash_movement
 * inside the same transaction.
 */
export async function createRepairJobTx(
  pool: Pool,
  dto: CreateRepairJobDto,
  userId: string | null,
  organizationId: string
): Promise<unknown> {
  if (!dto.customer_name?.trim()) {
    throw new RepairRepoError('customer_name is required', 400);
  }
  if (!dto.device?.model?.trim()) {
    throw new RepairRepoError('device.model is required', 400);
  }
  if (!dto.problem_description?.trim()) {
    throw new RepairRepoError('problem_description is required', 400);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── advisory lock: prevent concurrent duplicate booking for same customer+device ──
    // (lightweight — just uses a hash of customer+device to serialize concurrent requests)
    const lockKey = Math.abs(
      Array.from(`${dto.customer_name}:${dto.device.model}`).reduce(
        (h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0
      )
    );
    await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);

    // Generate sequential job_id: REP-0001, REP-0002, ...
    const seqRes = await client.query("SELECT nextval('repair_job_seq') AS seq");
    const seq = Number((seqRes.rows[0] as Record<string, unknown>)?.['seq'] ?? 1);
    const jobId = `REP-${String(seq).padStart(4, '0')}`;

    const now = new Date().toISOString();
    const id = uuidv4();

    const acc = dto.accessories ?? {};
    const priority = dto.priority ?? 'Normal';
    const inspectionJson = JSON.stringify(dto.initial_inspection ?? []);

    const timelineEntry = {
      _id: uuidv4(),
      status: 'Received',
      timestamp: now,
      user: { _id: userId ?? null, name: 'System', email: '' },
      description: 'Repair job created',
      note: `Job created. Priority: ${priority}.`,
    };

    await client.query(
      `INSERT INTO repair_jobs (
         id, job_id, customer_id, customer_name, customer_phone,
         device_type, device_brand, device_model, device_color, device_imei, device_password,
         acc_charger, acc_battery, acc_sim, acc_memory_card, acc_cover, acc_box, acc_other,
         problem_description, initial_inspection, technician_id,
         priority, status, estimated_cost, expected_delivery_date,
         internal_notes, customer_notes, timeline,
         labor_charges, additional_charges, discount,
         images_before, images_after, images_proof,
         settlement_status,
         branch_id, performed_by, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9, $10, $11,
         $12, $13, $14, $15, $16, $17, $18,
         $19, $20, $21,
         $22, 'Received', $23, $24,
         $25, $26, $27,
         '[]', 0, 0,
         '[]', '[]', '[]',
         'UNPAID',
         $28, $29, $30, $30
       )`,
      [
        id, jobId,
        dto.customer_id?.trim() || null,
        dto.customer_name.trim(),
        dto.customer_phone?.trim() || null,
        dto.device.type?.trim() || '',
        dto.device.brand?.trim() || '',
        dto.device.model.trim(),
        dto.device.color?.trim() || '',
        dto.device.imei?.trim() || '',
        dto.device.password?.trim() || null,
        Boolean(acc.charger), Boolean(acc.battery), Boolean(acc.sim),
        Boolean(acc.memoryCard), Boolean(acc.cover), Boolean(acc.box),
        acc.other?.trim() || null,
        dto.problem_description.trim(),
        inspectionJson,
        dto.technician_id?.trim() || null,
        priority,
        Number(dto.estimated_cost ?? 0),
        dto.expected_delivery_date?.trim() || null,
        dto.internal_notes?.trim() || null,
        dto.customer_notes?.trim() || null,
        JSON.stringify([timelineEntry]),
        dto.branch_id?.trim() || null,
        userId ?? null,
        now,
      ]
    );

    // ── Optional advance payment ──────────────────────────────────────────────
    if (dto.advance_payment && dto.advance_payment.amount > 0) {
      const adv = dto.advance_payment;
      const branchId = dto.branch_id?.trim() || null;
      const payId = uuidv4();
      let sessionId: string | null = null;
      let cmId: string | null = null;

      if (adv.method.toUpperCase() === 'CASH' && branchId) {
        // Validate open session for this branch
        const sessRes = await client.query(
          "SELECT id FROM cash_sessions WHERE branch_id = $1 AND status = 'OPEN' ORDER BY opened_at DESC LIMIT 1 FOR UPDATE",
          [branchId]
        );
        if (sessRes.rows.length === 0) {
          throw new RepairRepoError(
            'No open cash session found for this branch. Open a cash session before recording CASH payments.',
            422
          );
        }
        sessionId = (sessRes.rows[0] as Record<string, unknown>)['id'] as string;

        cmId = await insertCashMovement(client, {
          sessionId,
          branchId,
          movementType: 'REPAIR_ADVANCE',
          direction: 'IN',
          amount: adv.amount,
          referenceId: id,
          referenceNumber: jobId,
          paymentMethod: 'CASH',
          description: `Repair advance for job ${jobId}`,
          performedBy: userId,
          now,
        });
      }

      await client.query(
        `INSERT INTO repair_payments (
           id, repair_job_id, amount, method, reference,
           session_id, cash_movement_id, branch_id, performed_by, created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          payId, id, adv.amount, adv.method.toUpperCase(),
          adv.reference?.trim() || null,
          sessionId, cmId, branchId, userId, now,
        ]
      );
    }

    // ── Audit log ─────────────────────────────────────────────────────────────
    await writeChangeLogEntry(client, {
      organizationId,
      branchId: dto.branch_id?.trim() || '',
      eventType: 'REPAIR_JOB_CREATED',
      entityType: 'repair_job',
      entityId: id,
      payloadStr: JSON.stringify({ jobId, customerId: dto.customer_id, customerName: dto.customer_name }),
    });

    await client.query('COMMIT');

    const job = await getRepairJobById(pool, id);
    if (!job) throw new RepairRepoError('Failed to retrieve created repair job', 500);
    return job;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ─── Backward-compat non-tx create (delegates to tx version) ─────────────────
export async function createRepairJob(
  pool: Pool,
  dto: CreateRepairJobDto,
  userId: string | null
): Promise<unknown> {
  return createRepairJobTx(pool, dto, userId, '');
}

// ─── Status update (unchanged — no stock or cash involved) ───────────────────
export async function updateRepairStatus(
  pool: Pool,
  jobId: string,
  dto: UpdateRepairStatusDto,
  userId: string | null
): Promise<unknown> {
  const validStatuses = [
    'Received', 'Diagnosing', 'Waiting Customer Approval', 'Waiting Parts',
    'Repair In Progress', 'Quality Check', 'Ready for Pickup',
    'Cancelled', 'Rejected', 'On Hold', 'Returned Under Warranty',
    // NOTE: 'Delivered' is intentionally absent — use completeRepairJobTx
  ];
  if (!validStatuses.includes(dto.status)) {
    throw new RepairRepoError(`Invalid status: '${dto.status}'`, 400);
  }

  const existing = await pool.query(
    'SELECT id, timeline, status FROM repair_jobs WHERE id::text = $1 OR job_id = $1',
    [jobId]
  );
  if (existing.rows.length === 0) {
    throw new RepairRepoError(`Repair job '${jobId}' not found`, 404);
  }
  const row = existing.rows[0] as Record<string, unknown>;
  const realId = row['id'] as string;

  if (row['status'] === 'Delivered') {
    throw new RepairRepoError('Cannot update status of a delivered job', 409);
  }

  const timeline = parseJsonField<unknown[]>(row['timeline'], []);
  const now = new Date().toISOString();
  timeline.push({
    _id: uuidv4(),
    status: dto.status,
    timestamp: now,
    user: { _id: userId ?? null, name: 'System', email: '' },
    description: `Status changed to: ${dto.status}`,
    note: dto.note?.trim() || null,
  });

  await pool.query(
    'UPDATE repair_jobs SET status = $1, timeline = $2, updated_at = $3 WHERE id = $4',
    [dto.status, JSON.stringify(timeline), now, realId]
  );

  const updated = await getRepairJobById(pool, realId);
  if (!updated) throw new RepairRepoError('Failed to retrieve updated repair job', 500);
  return updated;
}

// ─── A3: addRepairPartTx ──────────────────────────────────────────────────────
/**
 * Atomically adds a part to a repair job. If product_id is provided:
 *  - Acquires FOR UPDATE lock on stock row (branch-scoped)
 *  - Checks stock sufficiency
 *  - Deducts quantity and creates stock_movements row (type=OUT, reason=REPAIR_CONSUMPTION:<job_id>)
 *  - Sets stock_deducted=TRUE on the repair_parts row
 * If product_id is null (consumable/labour): inserts without stock deduction.
 */
export async function addRepairPartTx(
  pool: Pool,
  jobId: string,
  dto: AddRepairPartDto,
  userId: string | null,
  organizationId: string
): Promise<unknown> {
  if (!dto.product_name?.trim()) {
    throw new RepairRepoError('product_name is required', 400);
  }
  if (!dto.qty || dto.qty <= 0 || !Number.isInteger(dto.qty)) {
    throw new RepairRepoError('qty must be a positive integer', 400);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch job — must exist and not be DELIVERED
    const jobRes = await client.query(
      'SELECT id, branch_id, job_id, status FROM repair_jobs WHERE id::text = $1 OR job_id = $1 FOR UPDATE',
      [jobId]
    );
    if (jobRes.rows.length === 0) {
      throw new RepairRepoError(`Repair job '${jobId}' not found`, 404);
    }
    const job = jobRes.rows[0] as Record<string, unknown>;
    const realId = job['id'] as string;
    const branchId = job['branch_id'] as string | null;
    const humanJobId = job['job_id'] as string;

    if (job['status'] === 'Delivered') {
      throw new RepairRepoError('Cannot add parts to a delivered job', 409);
    }

    const now = new Date().toISOString();
    const partId = uuidv4();
    let stockDeducted = false;
    let stockMovementId: string | null = null;
    const productId = dto.product_id?.trim() || null;

    if (productId && branchId) {
      // ── Acquire stock row lock (deadlock-safe single product here) ──────────
      const stockRes = await client.query(
        'SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2 FOR UPDATE',
        [productId, branchId]
      );
      if (stockRes.rows.length === 0) {
        throw new RepairRepoError(
          `Product '${productId}' has no stock record for branch '${branchId}'`,
          422
        );
      }
      const currentQty = Number((stockRes.rows[0] as Record<string, unknown>)['quantity'] ?? 0);
      if (currentQty < dto.qty) {
        throw new RepairRepoError(
          `Insufficient stock: ${currentQty} available, ${dto.qty} requested`,
          422
        );
      }

      // ── Deduct stock ─────────────────────────────────────────────────────────
      const deductRes = await client.query(
        `UPDATE stock
         SET quantity = quantity - $1, updated_at = $2
         WHERE product_id = $3 AND branch_id = $4
         RETURNING (quantity + $1) AS previous_stock, quantity AS resulting_stock`,
        [dto.qty, now, productId, branchId]
      );
      const deductRow = deductRes.rows[0] as Record<string, unknown>;

      // ── Stock movement ───────────────────────────────────────────────────────
      stockMovementId = uuidv4();
      await client.query(
        `INSERT INTO stock_movements (
           id, product_id, branch_id, movement_type, quantity,
           previous_stock, resulting_stock, reason,
           reference_id, performed_by, created_at
         ) VALUES ($1,$2,$3,'OUT',$4,$5,$6,$7,$8,$9,$10)`,
        [
          stockMovementId, productId, branchId,
          dto.qty,
          Number(deductRow['previous_stock']),
          Number(deductRow['resulting_stock']),
          `REPAIR_CONSUMPTION:${humanJobId}`,
          realId,
          userId, now,
        ]
      );

      stockDeducted = true;
    }

    // ── Insert repair_parts row ──────────────────────────────────────────────
    await client.query(
      `INSERT INTO repair_parts (
         id, repair_job_id, product_id, product_name, product_sku,
         qty, cost, price, added_at,
         stock_deducted, stock_movement_id, branch_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        partId, realId,
        productId,
        dto.product_name.trim(),
        dto.product_sku?.trim() || '',
        dto.qty,
        Number(dto.cost ?? 0),
        Number(dto.price ?? 0),
        now,
        stockDeducted, stockMovementId, branchId,
      ]
    );

    await client.query('UPDATE repair_jobs SET updated_at = $1 WHERE id = $2', [now, realId]);

    // ── Audit log ────────────────────────────────────────────────────────────
    await writeChangeLogEntry(client, {
      organizationId,
      branchId: branchId || '',
      eventType: 'REPAIR_PART_ADDED',
      entityType: 'repair_job',
      entityId: realId,
      payloadStr: JSON.stringify({
        partId, productId, productName: dto.product_name, qty: dto.qty,
        stockDeducted, stockMovementId,
      }),
    });

    await client.query('COMMIT');

    const updated = await getRepairJobById(pool, realId);
    if (!updated) throw new RepairRepoError('Failed to retrieve updated repair job', 500);
    return updated;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ─── A3: removeRepairPartTx ───────────────────────────────────────────────────
/**
 * Atomically removes a part from a repair job.
 * If stock_deducted = TRUE, creates a compensating IN stock movement.
 */
export async function removeRepairPartTx(
  pool: Pool,
  jobId: string,
  partId: string,
  userId: string | null,
  organizationId: string
): Promise<unknown> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch job
    const jobRes = await client.query(
      'SELECT id, branch_id, job_id, status FROM repair_jobs WHERE id::text = $1 OR job_id = $1 FOR UPDATE',
      [jobId]
    );
    if (jobRes.rows.length === 0) {
      throw new RepairRepoError(`Repair job '${jobId}' not found`, 404);
    }
    const job = jobRes.rows[0] as Record<string, unknown>;
    const realJobId = job['id'] as string;
    const branchId = job['branch_id'] as string | null;
    const humanJobId = job['job_id'] as string;

    if (job['status'] === 'Delivered') {
      throw new RepairRepoError('Cannot remove parts from a delivered job', 409);
    }

    // Fetch part
    const partRes = await client.query(
      'SELECT id, product_id, qty, stock_deducted, stock_movement_id FROM repair_parts WHERE id = $1 AND repair_job_id = $2',
      [partId, realJobId]
    );
    if (partRes.rows.length === 0) {
      throw new RepairRepoError(`Part '${partId}' not found on job '${jobId}'`, 404);
    }
    const part = partRes.rows[0] as Record<string, unknown>;
    const productId = part['product_id'] as string | null;
    const qty = Number(part['qty']);
    const stockDeducted = Boolean(part['stock_deducted']);

    const now = new Date().toISOString();

    // ── Compensating stock IN if stock was previously deducted ───────────────
    if (stockDeducted && productId && branchId) {
      const stockRes = await client.query(
        'SELECT quantity FROM stock WHERE product_id = $1 AND branch_id = $2 FOR UPDATE',
        [productId, branchId]
      );
      if (stockRes.rows.length > 0) {
        const currentQty = Number((stockRes.rows[0] as Record<string, unknown>)['quantity'] ?? 0);

        await client.query(
          `UPDATE stock SET quantity = quantity + $1, updated_at = $2
           WHERE product_id = $3 AND branch_id = $4`,
          [qty, now, productId, branchId]
        );

        const compensatingMovId = uuidv4();
        await client.query(
          `INSERT INTO stock_movements (
             id, product_id, branch_id, movement_type, quantity,
             previous_stock, resulting_stock, reason,
             reference_id, performed_by, created_at
           ) VALUES ($1,$2,$3,'IN',$4,$5,$6,$7,$8,$9,$10)`,
          [
            compensatingMovId, productId, branchId,
            qty, currentQty, currentQty + qty,
            `REPAIR_PART_REMOVED:${humanJobId}`,
            realJobId,
            userId, now,
          ]
        );
      }
    }

    // ── Remove part ──────────────────────────────────────────────────────────
    await client.query('DELETE FROM repair_parts WHERE id = $1', [partId]);
    await client.query('UPDATE repair_jobs SET updated_at = $1 WHERE id = $2', [now, realJobId]);

    // ── Audit log ────────────────────────────────────────────────────────────
    await writeChangeLogEntry(client, {
      organizationId,
      branchId: branchId || '',
      eventType: 'REPAIR_PART_REMOVED',
      entityType: 'repair_job',
      entityId: realJobId,
      payloadStr: JSON.stringify({ partId, productId, qty, stockDeducted }),
    });

    await client.query('COMMIT');

    const updated = await getRepairJobById(pool, realJobId);
    if (!updated) throw new RepairRepoError('Failed to retrieve updated repair job', 500);
    return updated;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ─── A4: addRepairPaymentTx ───────────────────────────────────────────────────
/**
 * Atomically records a payment against a repair job.
 * CASH: validates open session for job's branch, creates cash_movement.
 * Non-CASH: records payment row only.
 */
export async function addRepairPaymentTx(
  pool: Pool,
  jobId: string,
  dto: AddRepairPaymentDto,
  userId: string | null,
  organizationId: string
): Promise<unknown> {
  if (!dto.amount || dto.amount <= 0) {
    throw new RepairRepoError('amount must be greater than 0', 400);
  }
  if (!dto.method?.trim()) {
    throw new RepairRepoError('method is required', 400);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch job — branch_id authoritative from DB, never from body
    const jobRes = await client.query(
      'SELECT id, branch_id, job_id, status FROM repair_jobs WHERE id::text = $1 OR job_id = $1 FOR UPDATE',
      [jobId]
    );
    if (jobRes.rows.length === 0) {
      throw new RepairRepoError(`Repair job '${jobId}' not found`, 404);
    }
    const job = jobRes.rows[0] as Record<string, unknown>;
    const realId = job['id'] as string;
    const branchId = job['branch_id'] as string | null;
    const humanJobId = job['job_id'] as string;

    if (job['status'] === 'Delivered') {
      throw new RepairRepoError('Cannot add payments to a delivered job; use the finish endpoint', 409);
    }

    const now = new Date().toISOString();
    const payId = uuidv4();
    const method = dto.method.toUpperCase();
    let sessionId: string | null = null;
    let cmId: string | null = null;

    if (method === 'CASH' && branchId) {
      const sessRes = await client.query(
        "SELECT id FROM cash_sessions WHERE branch_id = $1 AND status = 'OPEN' ORDER BY opened_at DESC LIMIT 1 FOR UPDATE",
        [branchId]
      );
      if (sessRes.rows.length === 0) {
        throw new RepairRepoError(
          'No open cash session found for this branch. Open a cash session before recording CASH payments.',
          422
        );
      }
      sessionId = (sessRes.rows[0] as Record<string, unknown>)['id'] as string;

      cmId = await insertCashMovement(client, {
        sessionId,
        branchId,
        movementType: 'REPAIR_ADVANCE',
        direction: 'IN',
        amount: dto.amount,
        referenceId: realId,
        referenceNumber: humanJobId,
        paymentMethod: 'CASH',
        description: `Repair payment for job ${humanJobId}`,
        performedBy: userId,
        now,
      });
    }

    await client.query(
      `INSERT INTO repair_payments (
         id, repair_job_id, amount, method, reference,
         session_id, cash_movement_id, branch_id, performed_by, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [payId, realId, dto.amount, method, dto.reference?.trim() || null,
       sessionId, cmId, branchId, userId, now]
    );

    await client.query('UPDATE repair_jobs SET updated_at = $1 WHERE id = $2', [now, realId]);

    // ── Audit log ────────────────────────────────────────────────────────────
    await writeChangeLogEntry(client, {
      organizationId,
      branchId: branchId || '',
      eventType: 'REPAIR_PAYMENT_ADDED',
      entityType: 'repair_job',
      entityId: realId,
      payloadStr: JSON.stringify({ payId, amount: dto.amount, method, sessionId }),
    });

    await client.query('COMMIT');

    const updated = await getRepairJobById(pool, realId);
    if (!updated) throw new RepairRepoError('Failed to retrieve updated repair job', 500);
    return updated;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ─── Backward-compat non-tx addRepairPayment ─────────────────────────────────
export async function addRepairPayment(
  pool: Pool,
  jobId: string,
  dto: AddRepairPaymentDto,
  userId: string | null
): Promise<unknown> {
  return addRepairPaymentTx(pool, jobId, dto, userId, '');
}

// ─── Backward-compat non-tx addRepairPart ────────────────────────────────────
export async function addRepairPart(
  pool: Pool,
  jobId: string,
  dto: AddRepairPartDto,
  userId: string | null
): Promise<unknown> {
  return addRepairPartTx(pool, jobId, dto, userId, '');
}

// ─── A6: completeRepairJobTx ──────────────────────────────────────────────────
/**
 * Atomically delivers a repair job:
 *  1. Advisory lock — prevents duplicate delivery
 *  2. Validates job exists, is not already DELIVERED, and has a branch
 *  3. Allocates repair invoice number from repair_invoice_counters (per-branch)
 *  4. Applies optional discount/additional_charges from DTO
 *  5. Computes net_total and outstanding balance
 *  6. Records settlement payment (if provided), linking to open cash session for CASH
 *  7. Sets settlement_status: 'PAID' if fully paid, 'CREDIT' if balance remains
 *     (no customer_ledger_entries are created — repair jobs are not customer-account sales)
 *  8. Sets status='Delivered', invoice_number, delivered_at, delivered_by, settlement_status
 *  9. Writes audit log inside the same transaction
 */
export async function completeRepairJobTx(
  pool: Pool,
  jobId: string,
  dto: CompleteRepairJobDto,
  userId: string | null,
  organizationId: string
): Promise<unknown> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Advisory lock keyed to this specific job ──────────────────────────────
    const lockHashRes = await client.query(
      "SELECT hashtext($1)::BIGINT AS h",
      [`repair_delivery:${jobId}`]
    );
    const lockHash = Number((lockHashRes.rows[0] as Record<string, unknown>)['h']);
    await client.query('SELECT pg_advisory_xact_lock($1)', [lockHash]);

    // ── Fetch and lock job ────────────────────────────────────────────────────
    const jobRes = await client.query(
      `SELECT rj.*, u.name AS technician_name
       FROM repair_jobs rj
       LEFT JOIN users u ON u.id = rj.technician_id
       WHERE rj.id::text = $1 OR rj.job_id = $1
       FOR UPDATE OF rj`,
      [jobId]
    );
    if (jobRes.rows.length === 0) {
      throw new RepairRepoError(`Repair job '${jobId}' not found`, 404);
    }
    const job = jobRes.rows[0] as Record<string, unknown>;
    const realId = job['id'] as string;
    const branchId = job['branch_id'] as string | null;
    const customerId = job['customer_id'] as string | null;
    const humanJobId = job['job_id'] as string;

    if (job['status'] === 'Delivered') {
      throw new RepairRepoError(`Job '${humanJobId}' is already delivered`, 409);
    }
    if (!branchId) {
      throw new RepairRepoError('Cannot deliver a repair job that has no branch assigned', 422);
    }

    // ── Allocate invoice number ───────────────────────────────────────────────
    const invoiceRes = await client.query(
      `INSERT INTO repair_invoice_counters (branch_id, next_value)
       VALUES ($1, 2)
       ON CONFLICT (branch_id)
       DO UPDATE SET next_value = repair_invoice_counters.next_value + 1
       RETURNING next_value - 1 AS allocated`,
      [branchId]
    );
    const invoiceSeq = Number((invoiceRes.rows[0] as Record<string, unknown>)['allocated']);
    const invoiceNumber = `REP-${String(invoiceSeq).padStart(5, '0')}`;

    // ── Compute parts total ───────────────────────────────────────────────────
    const partsRes = await client.query(
      'SELECT qty, price FROM repair_parts WHERE repair_job_id = $1',
      [realId]
    );
    const partsTotal = (partsRes.rows as Array<Record<string, unknown>>)
      .reduce((s, r) => s + Number(r['qty']) * Number(r['price']), 0);

    const laborCharges = parseJsonField<Array<{ amount: number }>>(job['labor_charges'], []);
    const laborTotal = laborCharges.reduce((s, l) => s + Number(l.amount ?? 0), 0);

    // Apply any DTO overrides (only if explicitly provided)
    const additionalCharges = dto.additional_charges !== undefined
      ? Number(dto.additional_charges)
      : Number(job['additional_charges'] ?? 0);
    const discount = dto.discount !== undefined
      ? Number(dto.discount)
      : Number(job['discount'] ?? 0);

    const netTotal = partsTotal + laborTotal + additionalCharges - discount;

    // Sum valid payments already recorded
    const paidRes = await client.query(
      'SELECT COALESCE(SUM(amount), 0)::BIGINT AS total FROM repair_payments WHERE repair_job_id = $1',
      [realId]
    );
    const alreadyPaid = Number((paidRes.rows[0] as Record<string, unknown>)['total'] ?? 0);

    const now = new Date().toISOString();
    let totalPaid = alreadyPaid;
    let settlementPayId: string | null = null;
    let settlementCmId: string | null = null;
    let settlementSessionId: string | null = null;

    // ── Settlement payment (outstanding balance) ──────────────────────────────
    if (dto.settlement_payment && dto.settlement_payment.amount > 0) {
      const sp = dto.settlement_payment;
      const method = sp.method.toUpperCase();
      settlementPayId = uuidv4();

      if (method === 'CASH') {
        const sessRes = await client.query(
          "SELECT id FROM cash_sessions WHERE branch_id = $1 AND status = 'OPEN' ORDER BY opened_at DESC LIMIT 1 FOR UPDATE",
          [branchId]
        );
        if (sessRes.rows.length === 0) {
          throw new RepairRepoError(
            'No open cash session for this branch. Open a cash session before CASH settlement.',
            422
          );
        }
        settlementSessionId = (sessRes.rows[0] as Record<string, unknown>)['id'] as string;

        settlementCmId = await insertCashMovement(client, {
          sessionId: settlementSessionId,
          branchId,
          movementType: 'REPAIR_SETTLEMENT',
          direction: 'IN',
          amount: sp.amount,
          referenceId: realId,
          referenceNumber: invoiceNumber,
          paymentMethod: 'CASH',
          description: `Repair settlement for invoice ${invoiceNumber}`,
          performedBy: userId,
          now,
        });
      }

      await client.query(
        `INSERT INTO repair_payments (
           id, repair_job_id, amount, method, reference,
           session_id, cash_movement_id, branch_id, performed_by, created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          settlementPayId, realId, sp.amount, method,
          sp.reference?.trim() || null,
          settlementSessionId, settlementCmId,
          branchId, userId, now,
        ]
      );

      totalPaid += sp.amount;
    }

    // ── Settlement status ─────────────────────────────────────────────────────
    // Set explicitly at delivery time.
    // 'CREDIT' = device delivered with an outstanding repair-job balance.
    // No customer_ledger_entries are created; customers.balance is NOT updated.
    // The linked customer_id (if any) is retained on the job for reference only.
    const outstanding = netTotal - totalPaid;

    // Workstream A — Walk-in settlement guard
    // A walk-in repair (customer_id IS NULL) must be fully settled before delivery.
    // Registered customers may carry a balance (CREDIT); walk-ins cannot.
    if (customerId === null && outstanding > 0) {
      throw new RepairRepoError(
        `Walk-in repairs must be fully settled before delivery. Outstanding balance: ${outstanding}`,
        422
      );
    }

    const settlementStatus = outstanding <= 0 ? 'PAID' : 'CREDIT';

    // ── Timeline entry ────────────────────────────────────────────────────────
    const timeline = parseJsonField<unknown[]>(job['timeline'], []);
    timeline.push({
      _id: uuidv4(),
      status: 'Delivered',
      timestamp: now,
      user: { _id: userId ?? null, name: 'System', email: '' },
      description: `Job delivered. Invoice: ${invoiceNumber}`,
      note: dto.delivery_notes?.trim() || null,
    });

    // ── Update job ────────────────────────────────────────────────────────────
    await client.query(
      `UPDATE repair_jobs SET
         status = 'Delivered',
         invoice_number = $1,
         delivered_at = $2,
         delivered_by = $3,
         settlement_status = $4,
         additional_charges = $5,
         discount = $6,
         timeline = $7,
         updated_at = $2
       WHERE id = $8`,
      [
        invoiceNumber, now, userId, settlementStatus,
        additionalCharges, discount,
        JSON.stringify(timeline),
        realId,
      ]
    );

    // ── Audit log ─────────────────────────────────────────────────────────────
    await writeChangeLogEntry(client, {
      organizationId,
      branchId,
      eventType: 'REPAIR_JOB_DELIVERED',
      entityType: 'repair_job',
      entityId: realId,
      payloadStr: JSON.stringify({
        invoiceNumber, humanJobId, netTotal, totalPaid, settlementStatus,
        settlementPayId, customerId,
      }),
    });

    await client.query('COMMIT');

    const result = await getRepairJobById(pool, realId);
    if (!result) throw new RepairRepoError('Failed to retrieve delivered repair job', 500);
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
