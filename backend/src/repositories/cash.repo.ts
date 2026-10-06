/**
 * Cash Sessions & Movements PostgreSQL Repository
 * Direct TypeScript port of src-tauri/src/services/cash_service.rs.
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

export type CashSessionStatus = 'OPEN' | 'CLOSED';
export type CashMovementDirection = 'IN' | 'OUT';

export interface CashSession {
  id: string;
  branch_id: string;
  opened_by: string;
  closed_by: string | null;
  opening_float: number;
  closing_float: number | null;
  expected_amount: number | null;
  status: CashSessionStatus;
  notes: string | null;
  opened_at: string;
  closed_at: string | null;
}

export interface CashMovement {
  id: string;
  session_id: string | null;
  branch_id: string;
  movement_type: string;
  direction: CashMovementDirection;
  amount: number;
  reference_id: string | null;
  reference_number: string | null;
  payment_method: string;
  description: string | null;
  performed_by: string | null;
  created_at: string;
}

export interface OpenCashSessionDto {
  branch_id: string;
  opening_float: number;
  notes?: string | null;
}

export interface CloseCashSessionDto {
  session_id: string;
  closing_float: number;
  notes?: string | null;
}

export interface RecordCashMovementDto {
  branch_id: string;
  movement_type: string;
  direction: 'IN' | 'OUT';
  amount: number;
  reference_id?: string | null;
  reference_number?: string | null;
  payment_method?: string | null;
  description?: string | null;
}

export class CashRepoError extends Error {
  constructor(message: string, public readonly statusCode: number = 400) {
    super(message);
    this.name = 'CashRepoError';
  }
}

export async function getCurrentCashSession(pool: Pool, branchId: string): Promise<CashSession | null> {
  const res = await pool.query(
    "SELECT * FROM cash_sessions WHERE branch_id = $1 AND status = 'OPEN' ORDER BY opened_at DESC LIMIT 1",
    [branchId]
  );
  if (res.rows.length === 0) return null;
  const row = res.rows[0] as Record<string, unknown>;
  return {
    id: row['id'] as string,
    branch_id: row['branch_id'] as string,
    opened_by: row['opened_by'] as string,
    closed_by: (row['closed_by'] as string | null) ?? null,
    opening_float: Number(row['opening_float'] ?? 0),
    closing_float: row['closing_float'] != null ? Number(row['closing_float']) : null,
    expected_amount: row['expected_amount'] != null ? Number(row['expected_amount']) : null,
    status: row['status'] as CashSessionStatus,
    notes: (row['notes'] as string | null) ?? null,
    opened_at: row['opened_at'] as string,
    closed_at: (row['closed_at'] as string | null) ?? null,
  };
}

export async function openCashSession(
  pool: Pool,
  dto: OpenCashSessionDto,
  userId: string
): Promise<CashSession> {
  const existing = await getCurrentCashSession(pool, dto.branch_id);
  if (existing) {
    throw new CashRepoError(`An open cash register session already exists for this branch (Session ID: ${existing.id})`, 400);
  }

  const id = uuidv4();
  const now = new Date().toISOString();

  await pool.query(
    `INSERT INTO cash_sessions (
       id, branch_id, opened_by, opening_float, status, notes, opened_at
     ) VALUES ($1, $2, $3, $4, 'OPEN', $5, $6)`,
    [id, dto.branch_id, userId, dto.opening_float, dto.notes ?? null, now]
  );

  return {
    id,
    branch_id: dto.branch_id,
    opened_by: userId,
    closed_by: null,
    opening_float: dto.opening_float,
    closing_float: null,
    expected_amount: null,
    status: 'OPEN',
    notes: dto.notes ?? null,
    opened_at: now,
    closed_at: null,
  };
}

export async function closeCashSession(
  pool: Pool,
  dto: CloseCashSessionDto,
  userId: string
): Promise<CashSession> {
  const res = await pool.query('SELECT * FROM cash_sessions WHERE id = $1', [dto.session_id]);
  if (res.rows.length === 0) {
    throw new CashRepoError(`Cash session '${dto.session_id}' not found`, 404);
  }
  const session = res.rows[0] as Record<string, unknown>;
  if (session['status'] === 'CLOSED') {
    throw new CashRepoError('Cash session is already closed', 400);
  }

  const branchId = session['branch_id'] as string;
  const openingFloat = Number(session['opening_float'] ?? 0);

  // Sum cash movements in this session
  const mvRes = await pool.query(
    `SELECT 
       COALESCE(SUM(CASE WHEN direction = 'IN' THEN amount ELSE 0 END), 0)::BIGINT AS total_in,
       COALESCE(SUM(CASE WHEN direction = 'OUT' THEN amount ELSE 0 END), 0)::BIGINT AS total_out
     FROM cash_movements WHERE session_id = $1 AND payment_method = 'CASH'`,
    [dto.session_id]
  );
  const totalIn = Number(mvRes.rows[0]?.['total_in'] ?? 0);
  const totalOut = Number(mvRes.rows[0]?.['total_out'] ?? 0);
  const expectedAmount = openingFloat + totalIn - totalOut;

  const now = new Date().toISOString();

  await pool.query(
    `UPDATE cash_sessions
     SET closing_float = $1, expected_amount = $2, closed_by = $3, status = 'CLOSED', closed_at = $4, notes = COALESCE($5, notes)
     WHERE id = $6`,
    [dto.closing_float, expectedAmount, userId, now, dto.notes ?? null, dto.session_id]
  );

  return {
    id: dto.session_id,
    branch_id: branchId,
    opened_by: session['opened_by'] as string,
    closed_by: userId,
    opening_float: openingFloat,
    closing_float: dto.closing_float,
    expected_amount: expectedAmount,
    status: 'CLOSED',
    notes: (dto.notes as string | null) ?? (session['notes'] as string | null) ?? null,
    opened_at: session['opened_at'] as string,
    closed_at: now,
  };
}

export async function recordCashMovement(
  pool: Pool,
  dto: RecordCashMovementDto,
  userId: string | null
): Promise<CashMovement> {
  const currentSess = await getCurrentCashSession(pool, dto.branch_id);
  const sessionId = currentSess ? currentSess.id : null;

  const id = uuidv4();
  const now = new Date().toISOString();
  const paymentMethod = (dto.payment_method ?? 'CASH').toUpperCase();

  await pool.query(
    `INSERT INTO cash_movements (
       id, session_id, branch_id, movement_type, direction, amount,
       reference_id, reference_number, payment_method, description, performed_by, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      id,
      sessionId,
      dto.branch_id,
      dto.movement_type,
      dto.direction,
      dto.amount,
      dto.reference_id ?? null,
      dto.reference_number ?? null,
      paymentMethod,
      dto.description ?? null,
      userId ?? null,
      now,
    ]
  );

  return {
    id,
    session_id: sessionId,
    branch_id: dto.branch_id,
    movement_type: dto.movement_type,
    direction: dto.direction,
    amount: dto.amount,
    reference_id: dto.reference_id ?? null,
    reference_number: dto.reference_number ?? null,
    payment_method: paymentMethod,
    description: dto.description ?? null,
    performed_by: userId ?? null,
    created_at: now,
  };
}

export async function listCashMovements(
  pool: Pool,
  branchId?: string | null,
  limit: number = 50
): Promise<CashMovement[]> {
  let query = 'SELECT * FROM cash_movements WHERE 1=1';
  const params: unknown[] = [];

  if (branchId) {
    query += ' AND branch_id = $1';
    params.push(branchId);
  }

  query += ` ORDER BY created_at DESC LIMIT ${limit}`;

  const res = await pool.query(query, params);
  return res.rows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: row['id'] as string,
      session_id: (row['session_id'] as string | null) ?? null,
      branch_id: row['branch_id'] as string,
      movement_type: row['movement_type'] as string,
      direction: row['direction'] as CashMovementDirection,
      amount: Number(row['amount'] ?? 0),
      reference_id: (row['reference_id'] as string | null) ?? null,
      reference_number: (row['reference_number'] as string | null) ?? null,
      payment_method: row['payment_method'] as string,
      description: (row['description'] as string | null) ?? null,
      performed_by: (row['performed_by'] as string | null) ?? null,
      created_at: row['created_at'] as string,
    };
  });
}
