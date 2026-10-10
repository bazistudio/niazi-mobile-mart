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
  amount: number; // i64 whole PKR rupees — do NOT convert to float
  payment_method: string;
  description: string;
  notes: string | null;
  expense_date: string; // YYYY-MM-DD
  status: ExpenseStatus;
  performed_by: string | null;
  performed_by_name: string | null;
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
  payment_method?: string | null;
  description: string;
  notes?: string | null;
  expense_date?: string | null; // YYYY-MM-DD; defaults to today
}

export interface ExpenseFilterDto {
  category_id?: string | null;
  branch_id?: string | null;
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
  async createExpense(dto: CreateExpenseDto, userId?: string | null): Promise<Expense> {
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
      const expenseDate = dto.expense_date ?? new Date().toISOString().substring(0, 10);
      const now = new Date().toISOString();
      const expenseId = uuidv4();

      // 3. INSERT expense
      await client.query(
        `INSERT INTO expenses (
          id, expense_number, category_id, branch_id, amount, payment_method,
          description, notes, expense_date, status, performed_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'COMPLETED', $10, $11, $12)`,
        [
          expenseId,
          expenseNumber,
          dto.category_id,
          branchId,
          dto.amount,
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
      if (paymentMethod === 'CASH') {
        const sessionResult = await client.query<{ id: string }>(
          `SELECT id FROM cash_sessions WHERE branch_id = $1 AND status = 'OPEN' LIMIT 1`,
          [branchId]
        );
        const sessionId = sessionResult.rows[0]?.id ?? null;
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
              e.branch_id, e.amount, e.payment_method, e.description,
              e.notes, e.expense_date, e.status, e.performed_by,
              u.full_name AS performed_by_name,
              e.created_at, e.updated_at
       FROM expenses e
       LEFT JOIN expense_categories ec ON ec.id = e.category_id
       LEFT JOIN users u ON u.id = e.performed_by
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
      conditions.push(`(e.description ILIKE $${idx} OR e.expense_number ILIKE $${idx})`);
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
              e.branch_id, e.amount, e.payment_method, e.description,
              e.notes, e.expense_date, e.status, e.performed_by,
              u.full_name AS performed_by_name,
              e.created_at, e.updated_at
       FROM expenses e
       LEFT JOIN expense_categories ec ON ec.id = e.category_id
       LEFT JOIN users u ON u.id = e.performed_by
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

  async cancelExpense(id: string, userId?: string | null): Promise<Expense> {
    const { v4: uuidv4 } = await import('uuid');
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Lock and read the expense
      const existingResult = await client.query<Expense>(
        `SELECT e.id, e.expense_number, e.category_id,
                ec.name AS category_name,
                e.branch_id, e.amount, e.payment_method, e.description,
                e.notes, e.expense_date, e.status, e.performed_by,
                u.full_name AS performed_by_name,
                e.created_at, e.updated_at
         FROM expenses e
         LEFT JOIN expense_categories ec ON ec.id = e.category_id
         LEFT JOIN users u ON u.id = e.performed_by
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
      if (existing.payment_method === 'CASH') {
        const sessionResult = await client.query<{ id: string }>(
          `SELECT id FROM cash_sessions WHERE branch_id = $1 AND status = 'OPEN' LIMIT 1`,
          [existing.branch_id]
        );
        const sessionId = sessionResult.rows[0]?.id ?? null;
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
              e.branch_id, e.amount, e.payment_method, e.description,
              e.notes, e.expense_date, e.status, e.performed_by,
              u.full_name AS performed_by_name,
              e.created_at, e.updated_at
       FROM expenses e
       LEFT JOIN expense_categories ec ON ec.id = e.category_id
       LEFT JOIN users u ON u.id = e.performed_by
       WHERE e.id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }
}
