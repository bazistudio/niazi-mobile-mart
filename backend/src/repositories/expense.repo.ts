/**
 * Expense Repository — TypeScript/PostgreSQL (Phase 3 migration)
 *
 * PostgreSQL is the ONLINE AUTHORITY for Expense operations.
 * Mirrors src-tauri/src/repositories/postgres_expense_repo.rs.
 *
 * IMPORTANT:
 *   - Amount is stored as i64 whole PKR rupees (integer, no floating point).
 *   - Expense number is sequential: EXP-000001, EXP-000002, … via counters table.
 *   - CASH payment creates an atomic cash_movements OUT row in the same transaction.
 *   - Cancel is append-only: status=CANCELLED + compensating cash_movements IN.
 *   - NO sync infrastructure here. Rust sync worker handles EXPENSE_CREATED events.
 *   - DO NOT implement Party here.
 */

import { Pool, PoolClient } from 'pg';
import { writeChangeLogEntry } from './change_log.repo';

// ─── PKT Business Date Helper (FIX-01) ──────────────────────────────────────────────────

/**
 * FIX-01: Returns the current calendar date in Asia/Karachi (PKT, UTC+5).
 * Business date fallback when no date is provided by the client.
 * new Date().toISOString() returns UTC; between 00:00-04:59 PKT it returns yesterday.
 * Returns: YYYY-MM-DD string in Pakistan Standard Time.
 */
function getPKTDateStringBackend(): string {
  const pktOffsetMs = 5 * 60 * 60 * 1000; // UTC+5 in milliseconds
  const pktDate = new Date(Date.now() + pktOffsetMs);
  const y = pktDate.getUTCFullYear();
  const m = String(pktDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(pktDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}


// ─── F-01/F-03: Exact BigInt conversion & validation helper ──────────────────
//
// PostgreSQL BIGINT columns (expenses.amount, expenses.unit_price) are returned
// by the `pg` driver as JavaScript decimal strings, NOT numbers.
// PostgreSQL INT columns (expenses.quantity) are returned as JavaScript numbers.
// DTO values (from routes/expense.routes.ts) are coerced to Number() before
// reaching this repository, so DTO fields are always JS numbers or null/undefined.
//
// This helper accepts EITHER representation and converts to exact BigInt:
//   - A JS safe integer   → BigInt(value)
//   - A decimal string    → BigInt(trimmed string), after strict format validation
//
// Rejects (throws ExpenseRepoError 400 'VALIDATION'):
//   - Non-finite values (NaN, ±Infinity)
//   - Unsafe JS integers (> Number.MAX_SAFE_INTEGER or < Number.MIN_SAFE_INTEGER)
//   - Fractional numbers or strings with decimal notation
//   - Malformed strings (empty, whitespace-only, non-numeric)
//   - Values outside the target PostgreSQL column type range
//
// colType: 'INT' enforces PostgreSQL signed INT32 range.
// colType: 'BIGINT' enforces PostgreSQL signed INT64 range.
//
// This helper does NOT invent new business rules. It only enforces type safety.

const PG_INT_MIN = BigInt('-2147483648');
const PG_INT_MAX = BigInt('2147483647');
const PG_BIGINT_MIN = BigInt('-9223372036854775808');
const PG_BIGINT_MAX = BigInt('9223372036854775807');

function toExactBigInt(
  value: number | string | null | undefined,
  fieldLabel: string,
  colType: 'INT' | 'BIGINT' = 'BIGINT'
): bigint {
  if (value === null || value === undefined) {
    throw new ExpenseRepoError(
      `${fieldLabel}: unexpected null/undefined in numeric conversion`,
      400,
      'VALIDATION'
    );
  }

  let result: bigint;

  if (typeof value === 'number') {
    // F-03: reject non-finite before any further check
    if (!isFinite(value)) {
      throw new ExpenseRepoError(
        `${fieldLabel}: non-finite value is not permitted (got ${value})`,
        400,
        'VALIDATION'
      );
    }
    // F-03: reject fractional numbers
    if (!Number.isInteger(value)) {
      throw new ExpenseRepoError(
        `${fieldLabel}: fractional value is not permitted (got ${value})`,
        400,
        'VALIDATION'
      );
    }
    // F-03: reject unsafe integers (precision loss risk)
    if (!Number.isSafeInteger(value)) {
      throw new ExpenseRepoError(
        `${fieldLabel}: unsafe integer is not permitted (got ${value})`,
        400,
        'VALIDATION'
      );
    }
    result = BigInt(value);
  } else {
    // typeof value === 'string' — from pg driver (BIGINT column)
    const trimmed = value.trim();
    // F-01: reject empty or whitespace-only strings
    if (trimmed.length === 0) {
      throw new ExpenseRepoError(
        `${fieldLabel}: empty string is not a valid integer`,
        400,
        'VALIDATION'
      );
    }
    // F-01: reject strings with decimal points, exponents, or non-digit chars
    // Valid form: optional leading minus, then one or more digits (no leading zeros
    // except for the value "0" itself, but we do not enforce that pedantic constraint
    // here — PostgreSQL would not store such a value anyway).
    if (!/^-?[0-9]+$/.test(trimmed)) {
      throw new ExpenseRepoError(
        `${fieldLabel}: malformed integer string '${trimmed}'`,
        400,
        'VALIDATION'
      );
    }
    try {
      result = BigInt(trimmed);
    } catch {
      throw new ExpenseRepoError(
        `${fieldLabel}: could not convert '${trimmed}' to BigInt`,
        400,
        'VALIDATION'
      );
    }
  }

  // F-03: enforce PostgreSQL column range
  const [minVal, maxVal] = colType === 'INT'
    ? [PG_INT_MIN, PG_INT_MAX]
    : [PG_BIGINT_MIN, PG_BIGINT_MAX];

  if (result < minVal || result > maxVal) {
    throw new ExpenseRepoError(
      `${fieldLabel}: value ${result} is outside PostgreSQL ${colType} range [${minVal}, ${maxVal}]`,
      400,
      'VALIDATION'
    );
  }

  return result;
}

// ─── Domain types ──────────────────────────────────────────────────────────────

export type ExpenseStatus = 'COMPLETED' | 'CANCELLED';

export interface ExpenseCategory {
  id: string;
  name: string;
  description: string | null;
  is_active: number; // 1=active, 0=inactive (matches PostgreSQL INT column)
  created_at: string;
  updated_at: string;
}

export interface Expense {
  id: string;
  expense_number: string;
  category_id: string;
  category_name: string | null;
  branch_id: string;
  branch_name: string | null;   // FEATURE-01: originating branch name
  branch_organization_id?: string | null; // SEC-01: org boundary check field
  amount: number; // i64 whole PKR rupees — do NOT convert to float
  quantity?: number | null;
  unit_price?: number | null;
  payment_method: string;
  description: string;
  notes: string | null;
  expense_date: string; // YYYY-MM-DD
  status: ExpenseStatus;
  performed_by: string | null;
  performed_by_name: string | null;  // authenticated creator name
  performed_by_role: string | null;  // FEATURE-01: creator role at creation time
  created_at: string;
  updated_at: string;
}

export interface CreateExpenseCategoryDto {
  name: string;
  description?: string | null;
}

export interface UpdateExpenseCategoryDto {
  name?: string;
  description?: string | null;
  is_active?: number;
}

export interface CreateExpenseDto {
  category_id: string;
  branch_id?: string | null;
  amount: number; // whole PKR rupees
  quantity?: number | null;
  unit_price?: number | null;
  payment_method?: string | null;
  description: string;
  notes?: string | null;
  expense_date?: string | null; // YYYY-MM-DD; defaults to today
}

export interface UpdateExpenseDto {
  category_id?: string | null;
  amount?: number;           // whole PKR rupees; if changed, cash correction applied
  quantity?: number | null;
  unit_price?: number | null;
  payment_method?: string | null;
  description?: string;
  notes?: string | null;
  expense_date?: string | null; // YYYY-MM-DD
  reason?: string | null;       // stored in change_log payload
}

export interface ExpenseSummaryByMethod {
  payment_method: string;
  total_amount: number;
  count: number;
}

export interface ExpenseSummaryByBranch {
  branch_id: string;
  branch_name: string | null;
  total_amount: number;
  total_count: number;
  cash_total: number;
}

export interface ExpenseSummary {
  total_amount: number;       // sum of COMPLETED expenses
  total_count: number;
  cash_total: number;         // sum of CASH COMPLETED expenses
  non_cash_total: number;     // sum of non-CASH COMPLETED expenses
  cancelled_count: number;
  by_payment_method: ExpenseSummaryByMethod[];
  by_branch: ExpenseSummaryByBranch[];  // FEATURE-01: branch-wise totals for ADMIN
}

export interface ExpenseFilterDto {
  category_id?: string | null;
  branch_id?: string | null;
  organization_id?: string | null; // FEATURE-01: org-wide ADMIN scope (bypasses branch filter when no branch_id)
  created_by_user_id?: string | null; // FEATURE-01: filter by creator
  payment_method?: string | null;
  status?: string | null;
  search?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  limit?: number | null;
  offset?: number | null;
}

// ─── Repo Error ────────────────────────────────────────────────────────────────

export class ExpenseRepoError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'ExpenseRepoError';
  }
}

// ─── Repository ───────────────────────────────────────────────────────────────

export class ExpenseRepo {
  constructor(private readonly pool: Pool) {}

  // ---------------------------------------------------------------------------
  // Categories
  // ---------------------------------------------------------------------------

  /**
   * Create a new expense category.
   * Mirrors PostgresExpenseRepository::create_category.
   */
  async createCategory(dto: CreateExpenseCategoryDto): Promise<ExpenseCategory> {
    const { v4: uuidv4 } = await import('uuid');
    const id = uuidv4();
    const now = new Date().toISOString();

    try {
      const result = await this.pool.query<ExpenseCategory>(
        `INSERT INTO expense_categories (id, name, description, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, 1, $4, $5)
         RETURNING id, name, description, is_active, created_at, updated_at`,
        [id, dto.name.trim(), dto.description ?? null, now, now]
      );
      return result.rows[0]!;
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr.code === '23505') {
        throw new ExpenseRepoError(
          `Expense category '${dto.name}' already exists`,
          409,
          'CONFLICT'
        );
      }
      throw err;
    }
  }

  /**
   * Update an expense category.
   */
  async updateCategory(id: string, dto: UpdateExpenseCategoryDto): Promise<ExpenseCategory> {
    const now = new Date().toISOString();
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (dto.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(dto.name.trim());
    }
    if (dto.description !== undefined) {
      fields.push(`description = $${idx++}`);
      values.push(dto.description);
    }
    if (dto.is_active !== undefined) {
      fields.push(`is_active = $${idx++}`);
      values.push(dto.is_active);
    }

    if (fields.length === 0) {
      const existing = await this.pool.query<ExpenseCategory>(
        `SELECT id, name, description, is_active, created_at, updated_at FROM expense_categories WHERE id = $1`,
        [id]
      );
      if (!existing.rows[0]) {
        throw new ExpenseRepoError(`Expense category '${id}' not found`, 404, 'NOT_FOUND');
      }
      return existing.rows[0];
    }

    fields.push(`updated_at = $${idx++}`);
    values.push(now);
    values.push(id);

    const result = await this.pool.query<ExpenseCategory>(
      `UPDATE expense_categories SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, name, description, is_active, created_at, updated_at`,
      values
    );
    if (!result.rows[0]) {
      throw new ExpenseRepoError(`Expense category '${id}' not found`, 404, 'NOT_FOUND');
    }
    return result.rows[0];
  }

  /**
   * List active expense categories.
   * Mirrors PostgresExpenseRepository::list_categories (WHERE is_active = 1 ORDER BY name ASC).
   */
  async listCategories(activeOnly: boolean = true): Promise<ExpenseCategory[]> {
    const query = activeOnly
      ? `SELECT id, name, description, is_active, created_at, updated_at
         FROM expense_categories WHERE is_active = 1 ORDER BY name ASC`
      : `SELECT id, name, description, is_active, created_at, updated_at
         FROM expense_categories ORDER BY name ASC`;
    const result = await this.pool.query<ExpenseCategory>(query);
    return result.rows;
  }

  // ---------------------------------------------------------------------------
  // Create expense (with atomic expense number + optional cash movement)
  // Mirrors PostgresExpenseRepository::create_expense_tx
  // ---------------------------------------------------------------------------

  /**
   * Create an expense inside a transaction.
   *
   * 1. UPDATE counters SET value = value + 1 WHERE name = 'expense_number'
   * 2. SELECT value → format as EXP-000001
   * 3. INSERT into expenses
   * 4. If payment_method = 'CASH': look up open cash session, INSERT cash_movements OUT
   *
   * Amount must be > 0 whole PKR rupees.
   */
  async createExpense(dto: CreateExpenseDto, userId?: string | null, organizationId?: string | null): Promise<Expense> {
    if (!dto.amount || dto.amount <= 0) {
      throw new ExpenseRepoError('Expense amount must be greater than zero', 400, 'VALIDATION');
    }

    const { v4: uuidv4 } = await import('uuid');
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Atomic sequential expense number
      await client.query(
        `UPDATE counters SET value = value + 1 WHERE name = 'expense_number'`
      );
      const counterResult = await client.query<{ value: number }>(
        `SELECT value FROM counters WHERE name = 'expense_number'`
      );
      const counterValue = Number(counterResult.rows[0]?.value ?? 1);
      const expenseNumber = `EXP-${String(counterValue).padStart(6, '0')}`;

      // 2. Determine payment method + branch + date
      const paymentMethod = (dto.payment_method ?? 'CASH').toUpperCase();
      const branchId = dto.branch_id ?? null;
      // FIX-01: Backend fallback uses PKT (Asia/Karachi, UTC+5) business date.
      // new Date().toISOString().substring(0,10) returns yesterday before 05:00 PKT.
      const expenseDate = dto.expense_date ?? getPKTDateStringBackend();
      const now = new Date().toISOString();
      const expenseId = uuidv4();

      // 3. INSERT expense (EXP-FIX-01: include quantity and unit_price)
      await client.query(
        `INSERT INTO expenses (
          id, expense_number, category_id, branch_id, amount, quantity, unit_price,
          payment_method, description, notes, expense_date, status, performed_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'COMPLETED', $12, $13, $14)`,
        [
          expenseId,
          expenseNumber,
          dto.category_id,
          branchId,
          dto.amount,
          dto.quantity ?? 1,
          dto.unit_price ?? null,
          paymentMethod,
          dto.description,
          dto.notes ?? null,
          expenseDate,
          userId ?? null,
          now,
          now,
        ]
      );

      // 4. Cash movement side effect for CASH payments
      // Workstream B: require an open session — reject 422 instead of silently inserting null
      if (paymentMethod === 'CASH') {
        const sessionResult = await client.query<{ id: string }>(
          `SELECT id FROM cash_sessions WHERE branch_id = $1 AND status = 'OPEN' ORDER BY opened_at DESC LIMIT 1 FOR UPDATE`,
          [branchId]
        );
        if (sessionResult.rows.length === 0) {
          throw new ExpenseRepoError(
            'No open cash session for this branch. Open a cash session before recording a CASH expense.',
            422,
            'NO_OPEN_SESSION'
          );
        }
        const sessionId = sessionResult.rows[0]!.id;
        const movementId = uuidv4();

        await client.query(
          `INSERT INTO cash_movements (
            id, session_id, branch_id, movement_type, direction, amount,
            reference_id, reference_number, payment_method, description, performed_by, created_at
          ) VALUES ($1, $2, $3, 'EXPENSE', 'OUT', $4, $5, $6, 'CASH', $7, $8, $9)`,
          [
            movementId,
            sessionId,
            branchId,
            dto.amount,
            expenseId,
            expenseNumber,
            dto.description,
            userId ?? null,
            now,
          ]
        );
      }

      // Workstream C: audit log inside the transaction (not in setImmediate outside it)
      if (organizationId && branchId) {
        await writeChangeLogEntry(client, {
          organizationId,
          branchId,
          eventType: 'EXPENSE_CREATED',
          entityType: 'expense',
          entityId: expenseId,
          payloadStr: JSON.stringify({
            expense_id: expenseId,
            amount: dto.amount,
            branch_id: branchId,
          }),
        });
      }

      await client.query('COMMIT');

      // Fetch and return the full expense (with category_name)
      const expense = await this.getExpenseByIdWithClient(client, expenseId);
      return expense!;
    } catch (err: unknown) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // Get by ID
  // ---------------------------------------------------------------------------

  async getExpenseById(id: string): Promise<Expense | null> {
    const result = await this.pool.query<Expense>(
      `SELECT e.id, e.expense_number, e.category_id,
              ec.name AS category_name,
              e.branch_id, b.name AS branch_name,
              b.organization_id AS branch_organization_id,
              e.amount, e.quantity, e.unit_price,
              e.payment_method, e.description,
              e.notes, e.expense_date, e.status, e.performed_by,
              u.name AS performed_by_name, u.role AS performed_by_role,
              e.created_at, e.updated_at
       FROM expenses e
       LEFT JOIN expense_categories ec ON ec.id = e.category_id
       LEFT JOIN users u ON u.id = e.performed_by
       LEFT JOIN branches b ON b.id = e.branch_id
       WHERE e.id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  // ---------------------------------------------------------------------------
  // List expenses (with dynamic filters)
  // Mirrors PostgresExpenseRepository::list_expenses
  // ---------------------------------------------------------------------------

  async listExpenses(filter: ExpenseFilterDto): Promise<Expense[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (filter.category_id) {
      conditions.push(`e.category_id = $${idx++}`);
      values.push(filter.category_id);
    }
    if (filter.branch_id) {
      conditions.push(`e.branch_id = $${idx++}`);
      values.push(filter.branch_id);
    } else if (filter.organization_id) {
      // FEATURE-01: ADMIN org-wide access — scope by organization without branch restriction
      conditions.push(`b.organization_id = $${idx++}`);
      values.push(filter.organization_id);
    }
    if (filter.created_by_user_id) {
      // FEATURE-01: filter by authenticated creator (performed_by)
      conditions.push(`e.performed_by = $${idx++}`);
      values.push(filter.created_by_user_id);
    }
    if (filter.payment_method) {
      conditions.push(`e.payment_method = $${idx++}`);
      values.push(filter.payment_method.toUpperCase());
    }
    if (filter.status) {
      conditions.push(`e.status = $${idx++}`);
      values.push(filter.status.toUpperCase());
    }
    if (filter.search) {
      // DEFECT-07 FIX: search now covers expense_number, description, category name,
      // and notes — matching the placeholder text 'Search by expense #, description, category...'
      conditions.push(
        `(e.expense_number ILIKE $${idx} OR e.description ILIKE $${idx} OR ec.name ILIKE $${idx} OR e.notes ILIKE $${idx})`
      );
      values.push(`%${filter.search}%`);
      idx++;
    }
    if (filter.start_date) {
      conditions.push(`e.expense_date >= $${idx++}`);
      values.push(filter.start_date);
    }
    if (filter.end_date) {
      conditions.push(`e.expense_date <= $${idx++}`);
      values.push(filter.end_date);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;

    const result = await this.pool.query<Expense>(
      `SELECT e.id, e.expense_number, e.category_id,
              ec.name AS category_name,
              e.branch_id, b.name AS branch_name,
              e.amount, e.quantity, e.unit_price,
              e.payment_method, e.description,
              e.notes, e.expense_date, e.status, e.performed_by,
              u.name AS performed_by_name, u.role AS performed_by_role,
              e.created_at, e.updated_at
       FROM expenses e
       LEFT JOIN expense_categories ec ON ec.id = e.category_id
       LEFT JOIN users u ON u.id = e.performed_by
       LEFT JOIN branches b ON b.id = e.branch_id
       ${where}
       ORDER BY e.expense_date DESC, e.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, limit, offset]
    );
    return result.rows;
  }

  // ---------------------------------------------------------------------------
  // Cancel expense
  // Append-only: marks CANCELLED + compensating cash_movements IN (if CASH)
  // Mirrors expense_service.rs::cancel_expense (cancel semantics)
  // ---------------------------------------------------------------------------

  async cancelExpense(id: string, userId?: string | null, organizationId?: string | null, reason?: string | null): Promise<Expense> {
    const { v4: uuidv4 } = await import('uuid');
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Lock and read the expense
      const existingResult = await client.query<Expense>(
        `SELECT e.id, e.expense_number, e.category_id,
                ec.name AS category_name,
                e.branch_id, b.name AS branch_name,
                e.amount, e.quantity, e.unit_price,
                e.payment_method, e.description,
                e.notes, e.expense_date, e.status, e.performed_by,
                u.name AS performed_by_name, u.role AS performed_by_role,
                e.created_at, e.updated_at
         FROM expenses e
         LEFT JOIN expense_categories ec ON ec.id = e.category_id
         LEFT JOIN users u ON u.id = e.performed_by
         LEFT JOIN branches b ON b.id = e.branch_id
         WHERE e.id = $1
         FOR UPDATE`,
        [id]
      );
      const existing = existingResult.rows[0];
      if (!existing) {
        throw new ExpenseRepoError(`Expense '${id}' not found`, 404, 'NOT_FOUND');
      }
      if (existing.status === 'CANCELLED') {
        throw new ExpenseRepoError(`Expense '${id}' is already cancelled`, 409, 'ALREADY_CANCELLED');
      }

      const now = new Date().toISOString();

      // 2. Mark as CANCELLED (append-only, immutable record)
      await client.query(
        `UPDATE expenses SET status = 'CANCELLED', updated_at = $1 WHERE id = $2`,
        [now, id]
      );

      // 3. Compensating cash movement IN for CASH payments
      // Workstream B: require an open session for the compensating movement too
      if (existing.payment_method === 'CASH') {
        const sessionResult = await client.query<{ id: string }>(
          `SELECT id FROM cash_sessions WHERE branch_id = $1 AND status = 'OPEN' ORDER BY opened_at DESC LIMIT 1 FOR UPDATE`,
          [existing.branch_id]
        );
        if (sessionResult.rows.length === 0) {
          throw new ExpenseRepoError(
            'No open cash session for this branch. Open a cash session before cancelling a CASH expense.',
            422,
            'NO_OPEN_SESSION'
          );
        }
        const sessionId = sessionResult.rows[0]!.id;
        const movementId = uuidv4();

        await client.query(
          `INSERT INTO cash_movements (
            id, session_id, branch_id, movement_type, direction, amount,
            reference_id, reference_number, payment_method, description, performed_by, created_at
          ) VALUES ($1, $2, $3, 'EXPENSE', 'IN', $4, $5, $6, 'CASH', $7, $8, $9)`,
          [
            movementId,
            sessionId,
            existing.branch_id,
            existing.amount,
            existing.id,
            existing.expense_number,
            `Cancellation of expense ${existing.expense_number}`,
            userId ?? null,
            now,
          ]
        );
      }

      // Workstream C: audit log inside the transaction (reason stored in payload)
      if (organizationId && existing.branch_id) {
        await writeChangeLogEntry(client, {
          organizationId,
          branchId: existing.branch_id,
          eventType: 'EXPENSE_CANCELLED',
          entityType: 'expense',
          entityId: id,
          payloadStr: JSON.stringify({
            expense_id: id,
            amount: existing.amount,
            branch_id: existing.branch_id,
            reason: reason ?? null,
          }),
        });
      }

      await client.query('COMMIT');

      // Return updated expense
      const updated = await this.getExpenseById(id);
      return updated!;
    } catch (err: unknown) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async getExpenseByIdWithClient(client: PoolClient, id: string): Promise<Expense | null> {
    const result = await client.query<Expense>(
      `SELECT e.id, e.expense_number, e.category_id,
              ec.name AS category_name,
              e.branch_id, b.name AS branch_name,
              b.organization_id AS branch_organization_id,
              e.amount, e.quantity, e.unit_price,
              e.payment_method, e.description,
              e.notes, e.expense_date, e.status, e.performed_by,
              u.name AS performed_by_name, u.role AS performed_by_role,
              e.created_at, e.updated_at
       FROM expenses e
       LEFT JOIN expense_categories ec ON ec.id = e.category_id
       LEFT JOIN users u ON u.id = e.performed_by
       LEFT JOIN branches b ON b.id = e.branch_id
       WHERE e.id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  // ---------------------------------------------------------------------------
  // Update expense (EXP-FIX-05)
  // Append-only cash correction: compensating cash_movements inserted atomically
  // ---------------------------------------------------------------------------

  async updateExpense(id: string, dto: UpdateExpenseDto, userId?: string | null, organizationId?: string | null): Promise<Expense> {
    const { v4: uuidv4 } = await import('uuid');
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Lock and read current expense (also fetches branch_organization_id for SEC-01 check)
      const existingResult = await client.query<Expense>(
        `SELECT e.id, e.expense_number, e.category_id,
                ec.name AS category_name,
                e.branch_id, b.name AS branch_name,
                b.organization_id AS branch_organization_id,
                e.amount, e.quantity, e.unit_price,
                e.payment_method, e.description,
                e.notes, e.expense_date, e.status, e.performed_by,
                u.name AS performed_by_name, u.role AS performed_by_role,
                e.created_at, e.updated_at
         FROM expenses e
         LEFT JOIN expense_categories ec ON ec.id = e.category_id
         LEFT JOIN users u ON u.id = e.performed_by
         LEFT JOIN branches b ON b.id = e.branch_id
         WHERE e.id = $1
         FOR UPDATE`,
        [id]
      );
      const existing = existingResult.rows[0];
      if (!existing) {
        throw new ExpenseRepoError(`Expense '${id}' not found`, 404, 'NOT_FOUND');
      }
      if (existing.status === 'CANCELLED') {
        throw new ExpenseRepoError('Cannot edit a cancelled expense', 409, 'ALREADY_CANCELLED');
      }

      // SEC-01: Organization boundary enforcement at DB lock time (race-safe)
      // Prevents ADMIN from one organization updating an expense belonging to another.
      // organizationId is derived from JWT (server-side) — never client-supplied.
      if (organizationId && existing.branch_organization_id && existing.branch_organization_id !== organizationId) {
        throw new ExpenseRepoError('Access to this expense is not authorized', 403, 'FORBIDDEN');
      }
      // Fail closed: if organizationId is provided but expense has no branch organization, deny
      if (organizationId && !existing.branch_organization_id) {
        throw new ExpenseRepoError('Access to this expense is not authorized', 403, 'FORBIDDEN');
      }

      const now = new Date().toISOString();
      const newAmount = dto.amount ?? existing.amount;
      const newPaymentMethod = dto.payment_method
        ? dto.payment_method.toUpperCase()
        : existing.payment_method;
      const oldPaymentMethod = existing.payment_method;
      const oldAmount = existing.amount;

      // CONCURRENCY-01: Repository-level invariant enforcement (amount = qty × unit_price).
      // This check runs AFTER the FOR UPDATE row lock is acquired, using the latest persisted
      // values. It is the authoritative concurrency safeguard: any TOCTOU race between two
      // concurrent requests that both passed the service-level preflight validation is caught
      // here because only one transaction holds the lock at a time.
      //
      // Effective values:
      //   finalQty        — supplied dto.quantity if present; else locked existing.quantity
      //   finalUnitPrice  — supplied dto.unit_price if present; else locked existing.unit_price
      //   finalAmount     — supplied dto.amount if present; else locked existing.amount
      //
      // Note on explicit null: dto.quantity = null means "clear the field" (nullable column).
      //   When the final effective value is null, the invariant is not applicable.
      //
      // The invariant fires ONLY when both finalQty and finalUnitPrice are non-null integers,
      // matching the same contract as the service-level DEFECT-02a check.
      {
        // F-01/F-03: Effective value computation — same semantics as before,
        // but now using exact BigInt arithmetic to handle:
        //   - F-01: existing BIGINT columns returned as strings by the pg driver
        //   - F-03: missing safe-integer / numeric-range validation

        const finalQtyRaw: number | null =
          dto.quantity !== undefined ? dto.quantity : (existing.quantity ?? null);
        const finalUnitPriceRaw: number | string | null =
          dto.unit_price !== undefined ? dto.unit_price : (existing.unit_price ?? null);
        const finalAmountRaw: number | string =
          dto.amount !== undefined ? dto.amount : existing.amount;

        if (finalQtyRaw !== null && finalUnitPriceRaw !== null) {
          // Both effective breakdown fields are present — validate the invariant exactly.
          // toExactBigInt validates range, rejects unsafe numbers, rejects non-integers,
          // and handles both JS number (from DTO) and decimal string (from pg BIGINT).
          const finalQtyBig = toExactBigInt(finalQtyRaw, 'quantity', 'INT');
          const finalUnitPriceBig = toExactBigInt(finalUnitPriceRaw, 'unit_price', 'BIGINT');
          const finalAmountBig = toExactBigInt(finalAmountRaw, 'amount', 'BIGINT');

          // Exact BigInt multiplication — no floating-point rounding.
          const expectedAmountBig = finalQtyBig * finalUnitPriceBig;

          // F-03: overflow guard — product must remain within positive BIGINT range
          if (expectedAmountBig > PG_BIGINT_MAX || expectedAmountBig < PG_BIGINT_MIN) {
            throw new ExpenseRepoError(
              `Expense amount overflow: quantity × unit_price exceeds PostgreSQL BIGINT range`,
              400,
              'VALIDATION'
            );
          }

          // F-01: comparison is BigInt === BigInt — exact, representation-independent.
          if (finalAmountBig !== expectedAmountBig) {
            throw new ExpenseRepoError(
              `Expense amount must equal quantity multiplied by unit price (${finalQtyBig} × ${finalUnitPriceBig} = ${expectedAmountBig}, got ${finalAmountBig})`,
              400,
              'VALIDATION'
            );
          }
        }
      }

      // 2. Build UPDATE fields
      const fields: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (dto.category_id !== undefined && dto.category_id !== null) {
        fields.push(`category_id = $${idx++}`);
        values.push(dto.category_id);
      }
      if (dto.amount !== undefined) {
        fields.push(`amount = $${idx++}`);
        values.push(dto.amount);
      }
      if (dto.quantity !== undefined) {
        fields.push(`quantity = $${idx++}`);
        values.push(dto.quantity);
      }
      if (dto.unit_price !== undefined) {
        fields.push(`unit_price = $${idx++}`);
        values.push(dto.unit_price);
      }
      if (dto.payment_method !== undefined && dto.payment_method !== null) {
        fields.push(`payment_method = $${idx++}`);
        values.push(newPaymentMethod);
      }
      if (dto.description !== undefined) {
        fields.push(`description = $${idx++}`);
        values.push(dto.description);
      }
      if (dto.notes !== undefined) {
        fields.push(`notes = $${idx++}`);
        values.push(dto.notes);
      }
      if (dto.expense_date !== undefined && dto.expense_date !== null) {
        fields.push(`expense_date = $${idx++}`);
        values.push(dto.expense_date);
      }

      if (fields.length > 0) {
        fields.push(`updated_at = $${idx++}`);
        values.push(now);
        values.push(id);
        await client.query(
          `UPDATE expenses SET ${fields.join(', ')} WHERE id = $${idx}`,
          values
        );
      }

      // 3. Cash movement corrections (append-only architecture)
      //    Case A: was CASH, stays CASH, amount changed -> correcting movement
      //    Case B: was CASH, changing to non-CASH -> reversal IN movement
      //    Case C: was non-CASH, changing to CASH -> new OUT movement
      //    Case D: non-CASH -> non-CASH -> no cash_movements needed
      const wasCash = oldPaymentMethod === 'CASH';
      const isCash = newPaymentMethod === 'CASH';

      if (wasCash || isCash) {
        const sessionResult = await client.query<{ id: string }>(
          `SELECT id FROM cash_sessions WHERE branch_id = $1 AND status = 'OPEN' ORDER BY opened_at DESC LIMIT 1 FOR UPDATE`,
          [existing.branch_id]
        );
        if (sessionResult.rows.length === 0) {
          throw new ExpenseRepoError(
            'No open cash session for this branch. Open a cash session before editing a CASH expense.',
            422,
            'NO_OPEN_SESSION'
          );
        }
        const sessionId = sessionResult.rows[0]!.id;

        if (wasCash && isCash) {
          // Case A: same payment method, amount changed
          const delta = newAmount - oldAmount;
          if (delta !== 0) {
            const movementId = uuidv4();
            const direction = delta > 0 ? 'OUT' : 'IN';
            await client.query(
              `INSERT INTO cash_movements (
                id, session_id, branch_id, movement_type, direction, amount,
                reference_id, reference_number, payment_method, description, performed_by, created_at
              ) VALUES ($1, $2, $3, 'EXPENSE', $4, $5, $6, $7, 'CASH', $8, $9, $10)`,
              [
                movementId, sessionId, existing.branch_id, direction,
                Math.abs(delta), existing.id, existing.expense_number,
                `Correction of expense ${existing.expense_number}`,
                userId ?? null, now,
              ]
            );
          }
        } else if (wasCash && !isCash) {
          // Case B: CASH -> non-CASH reversal
          const movementId = uuidv4();
          await client.query(
            `INSERT INTO cash_movements (
              id, session_id, branch_id, movement_type, direction, amount,
              reference_id, reference_number, payment_method, description, performed_by, created_at
            ) VALUES ($1, $2, $3, 'EXPENSE', 'IN', $4, $5, $6, 'CASH', $7, $8, $9)`,
            [
              movementId, sessionId, existing.branch_id,
              oldAmount, existing.id, existing.expense_number,
              `Payment method change reversal for expense ${existing.expense_number}`,
              userId ?? null, now,
            ]
          );
        } else {
          // Case C: non-CASH -> CASH new deduction
          const movementId = uuidv4();
          await client.query(
            `INSERT INTO cash_movements (
              id, session_id, branch_id, movement_type, direction, amount,
              reference_id, reference_number, payment_method, description, performed_by, created_at
            ) VALUES ($1, $2, $3, 'EXPENSE', 'OUT', $4, $5, $6, 'CASH', $7, $8, $9)`,
            [
              movementId, sessionId, existing.branch_id,
              newAmount, existing.id, existing.expense_number,
              `Payment method change for expense ${existing.expense_number}`,
              userId ?? null, now,
            ]
          );
        }
      }

      // 4. Audit log inside the transaction
      if (organizationId && existing.branch_id) {
        await writeChangeLogEntry(client, {
          organizationId,
          branchId: existing.branch_id,
          eventType: 'EXPENSE_UPDATED',
          entityType: 'expense',
          entityId: id,
          payloadStr: JSON.stringify({
            expense_id: id,
            reason: dto.reason ?? null,
            old_amount: oldAmount,
            new_amount: newAmount,
            old_payment_method: oldPaymentMethod,
            new_payment_method: newPaymentMethod,
          }),
        });
      }

      await client.query('COMMIT');
      const updated = await this.getExpenseByIdWithClient(client, id);
      return updated!;
    } catch (err: unknown) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // Authoritative expense summary (EXP-M02)
  // ---------------------------------------------------------------------------

  async getExpenseSummary(filter: ExpenseFilterDto): Promise<ExpenseSummary> {
    const conditions: string[] = ["e.status = 'COMPLETED'"];
    const values: unknown[] = [];
    let idx = 1;

    if (filter.branch_id) {
      conditions.push(`e.branch_id = $${idx++}`);
      values.push(filter.branch_id);
    } else if (filter.organization_id) {
      // FEATURE-01: ADMIN org-wide summary — join branches for org scope
      conditions.push(`b.organization_id = $${idx++}`);
      values.push(filter.organization_id);
    }
    if (filter.start_date) {
      conditions.push(`e.expense_date >= $${idx++}`);
      values.push(filter.start_date);
    }
    if (filter.end_date) {
      conditions.push(`e.expense_date <= $${idx++}`);
      values.push(filter.end_date);
    }
    if (filter.category_id) {
      conditions.push(`e.category_id = $${idx++}`);
      values.push(filter.category_id);
    }

    // Always join branches for organization_id scope and branch_name in by_branch
    const baseFrom = `FROM expenses e LEFT JOIN branches b ON b.id = e.branch_id`;
    const where = `WHERE ${conditions.join(' AND ')}`;

    const totalsResult = await this.pool.query<{
      total_amount: string;
      total_count: string;
      cash_total: string;
    }>(
      `SELECT
         COALESCE(SUM(e.amount), 0)::text AS total_amount,
         COUNT(*)::text AS total_count,
         COALESCE(SUM(CASE WHEN e.payment_method = 'CASH' THEN e.amount ELSE 0 END), 0)::text AS cash_total
       ${baseFrom}
       ${where}`,
      values
    );
    const totals = totalsResult.rows[0]!;
    const totalAmount = Number(totals.total_amount);
    const cashTotal = Number(totals.cash_total);

    // Cancelled count (same date/branch filters)
    const cancelConditions: string[] = ["e.status = 'CANCELLED'"];
    const cancelValues: unknown[] = [];
    let cidx = 1;
    if (filter.branch_id) { cancelConditions.push(`e.branch_id = $${cidx++}`); cancelValues.push(filter.branch_id); }
    else if (filter.organization_id) { cancelConditions.push(`b.organization_id = $${cidx++}`); cancelValues.push(filter.organization_id); }
    if (filter.start_date) { cancelConditions.push(`e.expense_date >= $${cidx++}`); cancelValues.push(filter.start_date); }
    if (filter.end_date) { cancelConditions.push(`e.expense_date <= $${cidx++}`); cancelValues.push(filter.end_date); }
    // DEFECT-07 FIX: category_id was missing from cancelConditions; the cancelled_count
    // KPI must respect the same category scope as total_count and by_payment_method.
    if (filter.category_id) { cancelConditions.push(`e.category_id = $${cidx++}`); cancelValues.push(filter.category_id); }

    const cancelResult = await this.pool.query<{ cancelled_count: string }>(
      `SELECT COUNT(*)::text AS cancelled_count ${baseFrom} WHERE ${cancelConditions.join(' AND ')}`,
      cancelValues
    );

    // By payment method breakdown
    const byMethodResult = await this.pool.query<{
      payment_method: string;
      total_amount: string;
      count: string;
    }>(
      `SELECT e.payment_method,
              COALESCE(SUM(e.amount), 0)::text AS total_amount,
              COUNT(*)::text AS count
       ${baseFrom}
       ${where}
       GROUP BY e.payment_method
       ORDER BY SUM(e.amount) DESC`,
      values
    );

    // FEATURE-01: Branch-wise totals (meaningful for ADMIN org-wide; for single-branch returns one row)
    const byBranchResult = await this.pool.query<{
      branch_id: string;
      branch_name: string | null;
      total_amount: string;
      total_count: string;
      cash_total: string;
    }>(
      `SELECT
         e.branch_id,
         b.name AS branch_name,
         COALESCE(SUM(e.amount), 0)::text AS total_amount,
         COUNT(*)::text AS total_count,
         COALESCE(SUM(CASE WHEN e.payment_method = 'CASH' THEN e.amount ELSE 0 END), 0)::text AS cash_total
       ${baseFrom}
       ${where}
       GROUP BY e.branch_id, b.name
       ORDER BY SUM(e.amount) DESC`,
      values
    );

    return {
      total_amount: totalAmount,
      total_count: Number(totals.total_count),
      cash_total: cashTotal,
      non_cash_total: totalAmount - cashTotal,
      cancelled_count: Number(cancelResult.rows[0]!.cancelled_count),
      by_payment_method: byMethodResult.rows.map(r => ({
        payment_method: r.payment_method,
        total_amount: Number(r.total_amount),
        count: Number(r.count),
      })),
      by_branch: byBranchResult.rows.map(r => ({
        branch_id: r.branch_id,
        branch_name: r.branch_name,
        total_amount: Number(r.total_amount),
        total_count: Number(r.total_count),
        cash_total: Number(r.cash_total),
      })),
    };
  }
}
