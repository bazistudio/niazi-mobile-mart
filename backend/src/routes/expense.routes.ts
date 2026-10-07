/**
 * Expense Routes — TypeScript Express router (Phase 3 migration)
 *
 * TypeScript is now the ONLINE AUTHORITY for Expense operations.
 * These routes replace the following Rust Axum handlers (server.rs):
 *
 *   GET  /api/expenses  → list_expenses_handler   (line 189 / ~1194)
 *   POST /api/expenses  → create_expense_handler  (line 189 / ~1219)
 *
 * Additional routes implemented:
 *   GET  /categories          → list expense categories (BEFORE /:id)
 *   POST /categories          → create expense category
 *   PUT  /categories/:id      → update expense category
 *   GET  /:id                 → get expense by ID
 *   POST /:id/cancel          → cancel expense (soft; append-only)
 *
 * Registered at BOTH /api/expenses and /api/v1/expenses for compatibility.
 * Note: Rust only has /api/expenses (no v1 alias) — TypeScript adds v1 alias.
 *
 * Authorization:
 *   All routes require valid JWT (authMiddleware).
 *   List / get / cancel: authorize_permission("expenses", null)
 *   Create expense:       authorize_permission("expenses", "expense:create")
 *   Create/update category: authorize_permission("expenses", "expenses:write")
 *   Mirrors Rust: authorize_permission(Some("expenses"), ...) in server.rs
 *
 * Branch resolution:
 *   Mirrors Rust resolve_branch():
 *   - If branch_id provided AND user is ADMIN → use it
 *   - If branch_id provided AND user is NOT ADMIN → verify matches JWT branch_id
 *   - If branch_id not provided → use JWT branch_id
 *   ADMIN role can access/create expenses for any branch.
 *
 * IMPORTANT: DO NOT add Party domain logic here.
 *            DO NOT add sync infrastructure here.
 *            DO NOT add new Expense features beyond existing behavior.
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { authMiddleware, authorizePermission } from '../auth';
import { ExpenseService, ExpenseServiceError } from '../services/expense.service';
import type { ExpenseFilterDto } from '../services/expense.service';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build the expense router bound to the given PostgreSQL pool.
 * Mount at BOTH /api/expenses and /api/v1/expenses.
 */
export function buildExpenseRouter(pool: Pool): Router {
  const router = Router();
  const service = new ExpenseService(pool);

  // All expense routes require authentication
  router.use(authMiddleware);

  // Authorization helpers

  /** Mirrors authorize_permission("expenses", null) */
  function requireExpensePermission(req: Request, res: Response): boolean {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Not authenticated' });
      return false;
    }
    const err = authorizePermission(identity, 'expenses', null);
    if (err) {
      res.status(403).json({ error: 'FORBIDDEN', message: err });
      return false;
    }
    return true;
  }

  /** Mirrors authorize_permission("expenses", "expense:create") */
  function requireExpenseCreatePermission(req: Request, res: Response): boolean {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Not authenticated' });
      return false;
    }
    const err = authorizePermission(identity, 'expenses', 'expense:create');
    if (err) {
      res.status(403).json({ error: 'FORBIDDEN', message: err });
      return false;
    }
    return true;
  }

  /** Mirrors authorize_permission("expenses", "expenses:write") for category management */
  function requireExpenseWritePermission(req: Request, res: Response): boolean {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Not authenticated' });
      return false;
    }
    const err = authorizePermission(identity, 'expenses', 'expenses:write');
    if (err) {
      res.status(403).json({ error: 'FORBIDDEN', message: err });
      return false;
    }
    return true;
  }

  /**
   * Resolve branch ID.
   * Mirrors Rust resolve_branch() in server.rs.
   *
   * ADMIN role can access any branch.
   * Non-ADMIN users can only access their own JWT branch_id.
   *
   * Returns the effective branch_id string, or null if no branch is determinable.
   * Throws (via res.status) when access is unauthorized.
   */
  function resolveBranch(
    req: Request,
    res: Response,
    requestedBranchId?: string | null
  ): string | null | 'UNAUTHORIZED' {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Not authenticated' });
      return 'UNAUTHORIZED';
    }

    const isAdmin =
      identity.role === 'ADMIN' ||
      identity.role === 'Admin' ||
      identity.role === 'admin';

    const requested = requestedBranchId?.trim() ?? null;

    if (requested) {
      if (!isAdmin && identity.branch_id && identity.branch_id !== requested) {
        res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Access to this branch is not authorized',
        });
        return 'UNAUTHORIZED';
      }
      return requested;
    }

    // Fall back to JWT branch
    return identity.branch_id ?? null;
  }

  // -------------------------------------------------------------------------
  // GET /categories — List expense categories
  // MUST be registered BEFORE GET /:id to avoid path collision.
  // Mirrors expense_category_list IPC command.
  // -------------------------------------------------------------------------

  router.get('/categories', async (req: Request, res: Response): Promise<void> => {
    if (!requireExpensePermission(req, res)) return;

    const activeOnly = req.query['active_only'] !== 'false'; // default true

    try {
      const categories = await service.listCategories(activeOnly);
      res.status(200).json(categories);
    } catch (err: unknown) {
      handleError(res, err, 'list_categories');
    }
  });

  // -------------------------------------------------------------------------
  // POST /categories — Create expense category
  // Mirrors expense_category_create IPC command.
  // Permission: expenses:write
  // -------------------------------------------------------------------------

  router.post('/categories', async (req: Request, res: Response): Promise<void> => {
    if (!requireExpenseWritePermission(req, res)) return;

    const body = req.body as Record<string, unknown>;

    if (typeof body['name'] !== 'string' || !String(body['name']).trim()) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    try {
      const category = await service.createCategory({
        name: body['name'] as string,
        description: (body['description'] as string | null | undefined) ?? null,
      });
      res.status(201).json(category);
    } catch (err: unknown) {
      handleError(res, err, 'create_category');
    }
  });

  // -------------------------------------------------------------------------
  // PUT /categories/:id — Update expense category
  // Mirrors expense_category_update IPC command.
  // Permission: expenses:write
  // -------------------------------------------------------------------------

  router.put('/categories/:id', async (req: Request, res: Response): Promise<void> => {
    if (!requireExpenseWritePermission(req, res)) return;

    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;

    try {
      const updated = await service.updateCategory(id, {
        name: body['name'] !== undefined ? (body['name'] as string) : undefined,
        description:
          body['description'] !== undefined
            ? (body['description'] as string | null)
            : undefined,
        is_active:
          body['is_active'] !== undefined
            ? body['is_active'] === true || body['is_active'] === 1
              ? 1
              : 0
            : undefined,
      });
      res.status(200).json(updated);
    } catch (err: unknown) {
      handleError(res, err, 'update_category');
    }
  });

  // -------------------------------------------------------------------------
  // GET / — List expenses
  // Mirrors list_expenses_handler (server.rs ~1194).
  // Permission: expenses (no sub-permission)
  // Branch resolved server-side via resolveBranch().
  // -------------------------------------------------------------------------

  router.get('/', async (req: Request, res: Response): Promise<void> => {
    if (!requireExpensePermission(req, res)) return;

    const requestedBranchId = req.query['branch_id'] as string | undefined;
    const effectiveBranchId = resolveBranch(req, res, requestedBranchId);
    if (effectiveBranchId === 'UNAUTHORIZED') return;

    const filter: ExpenseFilterDto = {
      category_id: (req.query['category_id'] as string | undefined) ?? null,
      branch_id: effectiveBranchId,
      payment_method: (req.query['payment_method'] as string | undefined) ?? null,
      status: (req.query['status'] as string | undefined) ?? null,
      search: (req.query['search'] as string | undefined) ?? null,
      start_date: (req.query['start_date'] as string | undefined) ?? null,
      end_date: (req.query['end_date'] as string | undefined) ?? null,
      limit: parseOptionalInt(req.query['limit'] as string | undefined),
      offset: parseOptionalInt(req.query['offset'] as string | undefined),
    };

    try {
      const expenses = await service.listExpenses(filter);
      res.status(200).json(expenses);
    } catch (err: unknown) {
      handleError(res, err, 'list_expenses');
    }
  });

  // -------------------------------------------------------------------------
  // POST / — Create expense
  // Mirrors create_expense_handler (server.rs ~1219).
  // Permission: expenses + expense:create
  // Returns 201 on success.
  // -------------------------------------------------------------------------

  router.post('/', async (req: Request, res: Response): Promise<void> => {
    if (!requireExpenseCreatePermission(req, res)) return;

    const identity = req.identity!;
    const body = req.body as Record<string, unknown>;

    // Resolve branch — mirrors Rust resolve_branch(payload.branch_id)
    const requestedBranchId =
      (body['branch_id'] as string | null | undefined) ?? null;
    const effectiveBranchId = resolveBranch(req, res, requestedBranchId);
    if (effectiveBranchId === 'UNAUTHORIZED') return;

    // Validate required fields early for clear 400 messages
    if (!body['category_id'] || typeof body['category_id'] !== 'string') {
      res.status(400).json({ error: 'category_id is required' });
      return;
    }
    if (!body['description'] || typeof body['description'] !== 'string') {
      res.status(400).json({ error: 'description is required' });
      return;
    }
    if (body['amount'] === undefined || body['amount'] === null) {
      res.status(400).json({ error: 'amount is required' });
      return;
    }

    try {
      const expense = await service.createExpense(
        {
          category_id: body['category_id'] as string,
          branch_id: effectiveBranchId,
          amount: Number(body['amount']),
          payment_method:
            (body['payment_method'] as string | null | undefined) ?? null,
          description: body['description'] as string,
          notes: (body['notes'] as string | null | undefined) ?? null,
          expense_date: (body['expense_date'] as string | null | undefined) ?? null,
        },
        identity.user_id
      );
      res.status(201).json(expense);
    } catch (err: unknown) {
      handleError(res, err, 'create_expense');
    }
  });

  // -------------------------------------------------------------------------
  // GET /:id — Get expense by ID
  // Mirrors expense_get_by_id IPC command (branch access check).
  // Permission: expenses (no sub-permission)
  // -------------------------------------------------------------------------

  router.get('/:id', async (req: Request, res: Response): Promise<void> => {
    if (!requireExpensePermission(req, res)) return;

    const identity = req.identity!;
    const { id } = req.params as { id: string };

    try {
      const expense = await service.getExpenseById(id);

      // Branch access check — mirrors IPC expense_get_by_id branch check
      const isAdmin =
        identity.role === 'ADMIN' ||
        identity.role === 'Admin' ||
        identity.role === 'admin';
      if (!isAdmin && identity.branch_id && expense.branch_id !== identity.branch_id) {
        res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Access to this branch is not authorized',
        });
        return;
      }

      res.status(200).json(expense);
    } catch (err: unknown) {
      handleError(res, err, 'get_expense_by_id');
    }
  });

  // -------------------------------------------------------------------------
  // POST /:id/cancel — Cancel an expense (soft, append-only)
  // Mirrors expense_service.rs::cancel_expense.
  // Permission: expenses (no sub-permission)
  // Returns 200 with updated expense.
  // -------------------------------------------------------------------------

  router.post('/:id/cancel', async (req: Request, res: Response): Promise<void> => {
    if (!requireExpensePermission(req, res)) return;

    const identity = req.identity!;
    const { id } = req.params as { id: string };

    try {
      // Fetch first to do branch access check before cancelling
      const existing = await service.getExpenseById(id);

      const isAdmin =
        identity.role === 'ADMIN' ||
        identity.role === 'Admin' ||
        identity.role === 'admin';
      if (!isAdmin && identity.branch_id && existing.branch_id !== identity.branch_id) {
        res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Access to this branch is not authorized',
        });
        return;
      }

      const cancelled = await service.cancelExpense(id, identity.user_id);
      res.status(200).json(cancelled);
    } catch (err: unknown) {
      handleError(res, err, 'cancel_expense');
    }
  });

  return router;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function handleError(res: Response, err: unknown, operation: string): void {
  if (err instanceof ExpenseServiceError) {
    const body: Record<string, unknown> = { error: err.message };
    if (err.code) body['code'] = err.code;
    res.status(err.statusCode).json(body);
    return;
  }
  console.error(`[expense/${operation}] Unexpected error:`, err);
  res.status(500).json({ error: 'Internal server error' });
}

function parseOptionalInt(value: string | undefined): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = parseInt(value, 10);
  return isNaN(n) ? null : n;
}
