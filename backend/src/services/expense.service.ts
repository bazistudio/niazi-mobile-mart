/**
 * Expense Service — TypeScript/Express (Phase 3 migration)
 *
 * Business logic layer for online Expense operations.
 * Wraps ExpenseRepo with input validation and error translation.
 * Mirrors src-tauri/src/services/expense_service.rs (Postgres path only).
 *
 * MIGRATION SCOPE: Language migration only — no new features, no Party domain.
 *
 * Authorization note:
 *   All authorization is enforced at the route layer via authMiddleware +
 *   authorizePermission. This service does not re-check authorization.
 *
 * Amount note:
 *   Expense amounts are whole PKR rupees (integer). Do NOT introduce floating point.
 */

import { Pool } from 'pg';
import {
  ExpenseRepo,
  ExpenseRepoError,
  type ExpenseCategory,
  type Expense,
  type CreateExpenseCategoryDto,
  type UpdateExpenseCategoryDto,
  type CreateExpenseDto,
  type UpdateExpenseDto,
  type ExpenseFilterDto,
  type ExpenseSummary,
} from '../repositories/expense.repo';

// ─── Service Error ─────────────────────────────────────────────────────────────

export class ExpenseServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'ExpenseServiceError';
  }
}

// ─── Re-export domain types for route layer convenience ──────────────────────

export type {
  ExpenseCategory,
  Expense,
  CreateExpenseCategoryDto,
  UpdateExpenseCategoryDto,
  CreateExpenseDto,
  UpdateExpenseDto,
  ExpenseFilterDto,
  ExpenseSummary,
};

// ─── Valid payment methods (mirrors Rust CHECK constraint) ───────────────────

const VALID_PAYMENT_METHODS = new Set([
  'CASH', 'CARD', 'BANK_TRANSFER', 'EASYPAISA', 'JAZZCASH', 'OTHER',
]);

// ─── Service ──────────────────────────────────────────────────────────────────

export class ExpenseService {
  private readonly repo: ExpenseRepo;

  constructor(pool: Pool) {
    this.repo = new ExpenseRepo(pool);
  }

  // ---------------------------------------------------------------------------
  // Categories
  // ---------------------------------------------------------------------------

  async createCategory(dto: CreateExpenseCategoryDto): Promise<ExpenseCategory> {
    if (typeof dto.name !== 'string' || !dto.name.trim()) {
      throw new ExpenseServiceError('Category name cannot be empty', 400, 'VALIDATION');
    }

    try {
      return await this.repo.createCategory(dto);
    } catch (err: unknown) {
      throw this.translateError(err, 'create_category');
    }
  }

  async updateCategory(id: string, dto: UpdateExpenseCategoryDto): Promise<ExpenseCategory> {
    if (!id?.trim()) {
      throw new ExpenseServiceError('Category ID is required', 400, 'VALIDATION');
    }
    if (dto.name !== undefined && (!dto.name || !dto.name.trim())) {
      throw new ExpenseServiceError('Category name cannot be empty', 400, 'VALIDATION');
    }

    try {
      return await this.repo.updateCategory(id, dto);
    } catch (err: unknown) {
      throw this.translateError(err, 'update_category');
    }
  }

  async listCategories(activeOnly: boolean = true): Promise<ExpenseCategory[]> {
    try {
      return await this.repo.listCategories(activeOnly);
    } catch (err: unknown) {
      throw this.translateError(err, 'list_categories');
    }
  }

  // ---------------------------------------------------------------------------
  // Expenses
  // ---------------------------------------------------------------------------

  /**
   * Create an expense.
   * Mirrors expense_service.rs::create_expense (Postgres path).
   *
   * Validates:
   *   - amount > 0 (integer whole PKR rupees)
   *   - description required
   *   - category_id required
   *   - payment_method must be valid if provided
   */
  async createExpense(dto: CreateExpenseDto, userId?: string | null, organizationId?: string | null): Promise<Expense> {
    // Validate required fields
    if (!dto.category_id?.trim()) {
      throw new ExpenseServiceError('Expense category is required', 400, 'VALIDATION');
    }
    // Normalize optional description (default to empty string to satisfy database constraint)
    const description =
      typeof dto.description === 'string'
        ? dto.description.trim()
        : '';
    dto.description = description;

    // Validate amount — must be positive integer
    const amount = dto.amount;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      throw new ExpenseServiceError('Expense amount must be a positive number', 400, 'VALIDATION');
    }
    if (!Number.isInteger(amount)) {
      throw new ExpenseServiceError(
        'Expense amount must be a whole number (PKR rupees, no decimals)',
        400,
        'VALIDATION'
      );
    }

    // Validate quantity if provided — positive integer
    if (dto.quantity !== undefined && dto.quantity !== null) {
      if (!Number.isInteger(dto.quantity) || dto.quantity <= 0) {
        throw new ExpenseServiceError('quantity must be a positive integer', 400, 'VALIDATION');
      }
    }

    // Validate unit_price if provided — positive integer
    if (dto.unit_price !== undefined && dto.unit_price !== null) {
      if (!Number.isInteger(dto.unit_price) || dto.unit_price <= 0) {
        throw new ExpenseServiceError('unit_price must be a positive integer (whole PKR rupees)', 400, 'VALIDATION');
      }
    }

    // DEFECT-02a: Enforce amount = quantity × unit_price invariant at creation time.
    // Applies only when both quantity and unit_price are explicitly provided.
    // Integer arithmetic — no floating-point risk at PKR whole-rupee scale.
    if (
      dto.quantity !== undefined && dto.quantity !== null &&
      dto.unit_price !== undefined && dto.unit_price !== null
    ) {
      const expectedAmount = dto.quantity * dto.unit_price;
      if (dto.amount !== expectedAmount) {
        throw new ExpenseServiceError(
          `Expense amount must equal quantity multiplied by unit price (${dto.quantity} × ${dto.unit_price} = ${expectedAmount}, got ${dto.amount})`,
          400,
          'VALIDATION'
        );
      }
    }

    // Validate payment method
    if (dto.payment_method) {
      const pm = dto.payment_method.toUpperCase();
      if (!VALID_PAYMENT_METHODS.has(pm)) {
        throw new ExpenseServiceError(
          `Invalid payment method '${dto.payment_method}'. Must be one of: ${[...VALID_PAYMENT_METHODS].join(', ')}`,
          400,
          'VALIDATION'
        );
      }
    }

    // Validate expense_date format if provided
    if (dto.expense_date && !/^\d{4}-\d{2}-\d{2}$/.test(dto.expense_date)) {
      throw new ExpenseServiceError(
        'expense_date must be in YYYY-MM-DD format',
        400,
        'VALIDATION'
      );
    }

    try {
      return await this.repo.createExpense(dto, userId, organizationId);
    } catch (err: unknown) {
      throw this.translateError(err, 'create_expense');
    }
  }

  /**
   * Get expense by ID.
   */
  async getExpenseById(id: string): Promise<Expense> {
    if (!id?.trim()) {
      throw new ExpenseServiceError('Expense ID is required', 400, 'VALIDATION');
    }
    try {
      const expense = await this.repo.getExpenseById(id);
      if (!expense) {
        throw new ExpenseServiceError(`Expense '${id}' not found`, 404, 'NOT_FOUND');
      }
      return expense;
    } catch (err: unknown) {
      throw this.translateError(err, 'get_expense_by_id');
    }
  }

  /**
   * List expenses with optional filters.
   * Mirrors list_expenses_handler — branch_id already resolved by route layer.
   */
  async listExpenses(filter: ExpenseFilterDto): Promise<Expense[]> {
    // Validate dates if provided
    if (filter.start_date && !/^\d{4}-\d{2}-\d{2}$/.test(filter.start_date)) {
      throw new ExpenseServiceError('start_date must be in YYYY-MM-DD format', 400, 'VALIDATION');
    }
    if (filter.end_date && !/^\d{4}-\d{2}-\d{2}$/.test(filter.end_date)) {
      throw new ExpenseServiceError('end_date must be in YYYY-MM-DD format', 400, 'VALIDATION');
    }

    try {
      return await this.repo.listExpenses(filter);
    } catch (err: unknown) {
      throw this.translateError(err, 'list_expenses');
    }
  }

  /**
   * Update an expense (EXP-FIX-05).
   * Append-only cash correction: compensating movements inserted atomically.
   * Reuses expense:create permission (no separate expense:update permission exists).
   */
  async updateExpense(id: string, dto: UpdateExpenseDto, userId?: string | null, organizationId?: string | null): Promise<Expense> {
    if (!id?.trim()) {
      throw new ExpenseServiceError('Expense ID is required', 400, 'VALIDATION');
    }

    // DEFECT-02a: Partial-update effective-value invariant check.
    // Resolve effective values: supplied value (if present) or persisted value (if not supplied).
    // Fetch only when any numeric field is touched; description-only updates skip this.
    const touchesNumericFields =
      dto.quantity !== undefined ||
      dto.unit_price !== undefined ||
      dto.amount !== undefined;

    if (touchesNumericFields) {
      // Read-only preflight fetch; the repo will re-lock at mutation time.
      const existing = await this.getExpenseById(id);

      const effectiveQty       = dto.quantity   !== undefined ? dto.quantity   : (existing.quantity   ?? null);
      const effectiveUnitPrice = dto.unit_price !== undefined ? dto.unit_price : (existing.unit_price ?? null);
      const effectiveAmount    = dto.amount     !== undefined ? dto.amount     : existing.amount;

      // Enforce invariant only when both qty and unit_price are known (non-null) after resolution.
      if (effectiveQty !== null && effectiveUnitPrice !== null) {
        const expectedAmount = effectiveQty * effectiveUnitPrice;
        if (effectiveAmount !== expectedAmount) {
          throw new ExpenseServiceError(
            `Expense amount must equal quantity multiplied by unit price (${effectiveQty} × ${effectiveUnitPrice} = ${expectedAmount}, got ${effectiveAmount})`,
            400,
            'VALIDATION'
          );
        }
      }
    }

    if (dto.amount !== undefined) {
      const amount = dto.amount;
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
        throw new ExpenseServiceError('Expense amount must be a positive number', 400, 'VALIDATION');
      }
      if (!Number.isInteger(amount)) {
        throw new ExpenseServiceError('Expense amount must be a whole number (PKR rupees, no decimals)', 400, 'VALIDATION');
      }
    }
    if (dto.quantity !== undefined && dto.quantity !== null) {
      if (!Number.isInteger(dto.quantity) || dto.quantity <= 0) {
        throw new ExpenseServiceError('quantity must be a positive integer', 400, 'VALIDATION');
      }
    }
    if (dto.unit_price !== undefined && dto.unit_price !== null) {
      if (!Number.isInteger(dto.unit_price) || dto.unit_price <= 0) {
        throw new ExpenseServiceError('unit_price must be a positive integer (whole PKR rupees)', 400, 'VALIDATION');
      }
    }
    if (dto.payment_method) {
      const pm = dto.payment_method.toUpperCase();
      if (!VALID_PAYMENT_METHODS.has(pm)) {
        throw new ExpenseServiceError(
          `Invalid payment method '${dto.payment_method}'. Must be one of: ${[...VALID_PAYMENT_METHODS].join(', ')}`,
          400,
          'VALIDATION'
        );
      }
    }
    if (dto.expense_date && !/^\d{4}-\d{2}-\d{2}$/.test(dto.expense_date)) {
      throw new ExpenseServiceError('expense_date must be in YYYY-MM-DD format', 400, 'VALIDATION');
    }
    try {
      return await this.repo.updateExpense(id, dto, userId, organizationId);
    } catch (err: unknown) {
      throw this.translateError(err, 'update_expense');
    }
  }

  /**
   * Get authoritative expense summary (EXP-M02).
   * Aggregates totals for a branch or organization, filtered by date range.
   */
  async getExpenseSummary(filter: ExpenseFilterDto): Promise<ExpenseSummary> {
    if (filter.start_date && !/^\d{4}-\d{2}-\d{2}$/.test(filter.start_date)) {
      throw new ExpenseServiceError('start_date must be in YYYY-MM-DD format', 400, 'VALIDATION');
    }
    if (filter.end_date && !/^\d{4}-\d{2}-\d{2}$/.test(filter.end_date)) {
      throw new ExpenseServiceError('end_date must be in YYYY-MM-DD format', 400, 'VALIDATION');
    }
    try {
      return await this.repo.getExpenseSummary(filter);
    } catch (err: unknown) {
      throw this.translateError(err, 'get_expense_summary');
    }
  }

  /**
   * Cancel an expense.
   * Append-only: marks CANCELLED + inserts compensating cash movement IN for CASH payments.
   * Mirrors expense_service.rs::cancel_expense.
   */
  async cancelExpense(id: string, userId?: string | null, organizationId?: string | null, reason?: string | null): Promise<Expense> {
    if (!id?.trim()) {
      throw new ExpenseServiceError('Expense ID is required', 400, 'VALIDATION');
    }
    try {
      return await this.repo.cancelExpense(id, userId, organizationId, reason);
    } catch (err: unknown) {
      throw this.translateError(err, 'cancel_expense');
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private translateError(err: unknown, operation: string): ExpenseServiceError {
    if (err instanceof ExpenseServiceError) return err;
    if (err instanceof ExpenseRepoError) {
      return new ExpenseServiceError(err.message, err.statusCode, err.code);
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ExpenseService.${operation}] Unexpected error:`, err);
    return new ExpenseServiceError(`Internal error in ${operation}: ${msg}`, 500, 'INTERNAL');
  }
}
