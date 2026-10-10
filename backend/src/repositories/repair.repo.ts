/**
 * Repair Jobs PostgreSQL Repository
 * P6: Real PostgreSQL backend replacing mocked repair.api.ts
 *
 * Business rules:
 *  - Admin-only write operations (create, update, add parts, add payments).
 *  - Read operations (list, get) are open to authenticated users.
 *  - Stock deduction for parts is not automatic here — use inventory adjust endpoint
 *    after confirming parts are physically consumed.
 *  - job_id is auto-generated from a PostgreSQL sequence: REP-NNNN.
 *  - All monetary values are whole PKR integers (BIGINT).
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getPartsForJob(pool: Pool, jobId: string): Promise<unknown[]> {
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
       p.current_stock
     FROM repair_parts rp
     LEFT JOIN (
       SELECT id, COALESCE(SUM(s.quantity), 0) AS current_stock
       FROM products
       LEFT JOIN stock s ON s.product_id = products.id
       GROUP BY products.id
     ) p ON p.id = rp.product_id
     WHERE rp.repair_job_id = $1
     ORDER BY rp.added_at ASC`,
    [jobId]
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
    addedAt: r['added_at'] as string,
  }));
}

async function getPaymentsForJob(pool: Pool, jobId: string): Promise<unknown[]> {
  const res = await pool.query(
    'SELECT id AS "_id", amount, method, reference, created_at FROM repair_payments WHERE repair_job_id = $1 ORDER BY created_at ASC',
    [jobId]
  );
  return res.rows.map((r: Record<string, unknown>) => ({
    _id: r['_id'],
    amount: Number(r['amount']),
    method: r['method'] as string,
    reference: (r['reference'] as string) || undefined,
    timestamp: r['created_at'] as string,
  }));
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
      const parts = await getPartsForJob(pool, row['id'] as string);
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
     WHERE rj.id = $1 OR rj.job_id = $1`,
    [id]
  );
  if (res.rows.length === 0) return null;
  const row = res.rows[0] as Record<string, unknown>;
  const parts = await getPartsForJob(pool, row['id'] as string);
  const payments = await getPaymentsForJob(pool, row['id'] as string);
  return rowToRepairJob(row, parts, payments);
}

export async function createRepairJob(
  pool: Pool,
  dto: CreateRepairJobDto,
  userId: string | null
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

    // Generate sequential job_id: REP-0001, REP-0002, ...
    const seqRes = await client.query("SELECT nextval('repair_job_seq') AS seq");
    const seq = Number((seqRes.rows[0] as Record<string, unknown>)?.['seq'] ?? 1);
    const jobId = `REP-${String(seq).padStart(4, '0')}`;

    const now = new Date().toISOString();
    const id = uuidv4();

    const acc = dto.accessories ?? {};
    const priority = dto.priority ?? 'Normal';
    const inspectionJson = JSON.stringify(dto.initial_inspection ?? []);

    const statusNote = `Job created. Priority: ${priority}.`;
    const timelineEntry = {
      _id: uuidv4(),
      status: 'Received',
      timestamp: now,
      user: { _id: userId ?? null, name: 'System', email: '' },
      description: 'Repair job created',
      note: statusNote,
    };
    const timelineJson = JSON.stringify([timelineEntry]);

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
        timelineJson,
        dto.branch_id?.trim() || null,
        userId ?? null,
        now,
      ]
    );

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

export async function updateRepairStatus(
  pool: Pool,
  jobId: string,
  dto: UpdateRepairStatusDto,
  userId: string | null
): Promise<unknown> {
  const validStatuses = [
    'Received', 'Diagnosing', 'Waiting Customer Approval', 'Waiting Parts',
    'Repair In Progress', 'Quality Check', 'Ready for Pickup', 'Delivered',
    'Cancelled', 'Rejected', 'On Hold', 'Returned Under Warranty',
  ];
  if (!validStatuses.includes(dto.status)) {
    throw new RepairRepoError(`Invalid status: '${dto.status}'`, 400);
  }

  const existing = await pool.query(
    'SELECT id, timeline, status FROM repair_jobs WHERE id = $1 OR job_id = $1',
    [jobId]
  );
  if (existing.rows.length === 0) {
    throw new RepairRepoError(`Repair job '${jobId}' not found`, 404);
  }
  const row = existing.rows[0] as Record<string, unknown>;
  const realId = row['id'] as string;
  const timeline = parseJsonField<unknown[]>(row['timeline'], []);

  const now = new Date().toISOString();
  const newEntry = {
    _id: uuidv4(),
    status: dto.status,
    timestamp: now,
    user: { _id: userId ?? null, name: 'System', email: '' },
    description: `Status changed to: ${dto.status}`,
    note: dto.note?.trim() || null,
  };
  timeline.push(newEntry);

  await pool.query(
    'UPDATE repair_jobs SET status = $1, timeline = $2, updated_at = $3 WHERE id = $4',
    [dto.status, JSON.stringify(timeline), now, realId]
  );

  const updated = await getRepairJobById(pool, realId);
  if (!updated) throw new RepairRepoError('Failed to retrieve updated repair job', 500);
  return updated;
}

export async function addRepairPart(
  pool: Pool,
  jobId: string,
  dto: AddRepairPartDto,
  _userId: string | null
): Promise<unknown> {
  if (!dto.product_name?.trim()) {
    throw new RepairRepoError('product_name is required', 400);
  }
  if (!dto.qty || dto.qty <= 0 || !Number.isInteger(dto.qty)) {
    throw new RepairRepoError('qty must be a positive integer', 400);
  }

  const existing = await pool.query(
    'SELECT id FROM repair_jobs WHERE id = $1 OR job_id = $1',
    [jobId]
  );
  if (existing.rows.length === 0) {
    throw new RepairRepoError(`Repair job '${jobId}' not found`, 404);
  }
  const realId = (existing.rows[0] as Record<string, unknown>)['id'] as string;

  const now = new Date().toISOString();
  const partId = uuidv4();

  await pool.query(
    `INSERT INTO repair_parts (id, repair_job_id, product_id, product_name, product_sku, qty, cost, price, added_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      partId, realId,
      dto.product_id?.trim() || null,
      dto.product_name.trim(),
      dto.product_sku?.trim() || '',
      dto.qty,
      Number(dto.cost ?? 0),
      Number(dto.price ?? 0),
      now,
    ]
  );

  await pool.query('UPDATE repair_jobs SET updated_at = $1 WHERE id = $2', [now, realId]);

  const updated = await getRepairJobById(pool, realId);
  if (!updated) throw new RepairRepoError('Failed to retrieve updated repair job', 500);
  return updated;
}

export async function addRepairPayment(
  pool: Pool,
  jobId: string,
  dto: AddRepairPaymentDto,
  _userId: string | null
): Promise<unknown> {
  if (!dto.amount || dto.amount <= 0) {
    throw new RepairRepoError('amount must be greater than 0', 400);
  }
  if (!dto.method?.trim()) {
    throw new RepairRepoError('method is required', 400);
  }

  const existing = await pool.query(
    'SELECT id FROM repair_jobs WHERE id = $1 OR job_id = $1',
    [jobId]
  );
  if (existing.rows.length === 0) {
    throw new RepairRepoError(`Repair job '${jobId}' not found`, 404);
  }
  const realId = (existing.rows[0] as Record<string, unknown>)['id'] as string;

  const now = new Date().toISOString();
  const payId = uuidv4();

  await pool.query(
    `INSERT INTO repair_payments (id, repair_job_id, amount, method, reference, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [payId, realId, Number(dto.amount), dto.method.trim(), dto.reference?.trim() || null, now]
  );

  await pool.query('UPDATE repair_jobs SET updated_at = $1 WHERE id = $2', [now, realId]);

  const updated = await getRepairJobById(pool, realId);
  if (!updated) throw new RepairRepoError('Failed to retrieve updated repair job', 500);
  return updated;
}
