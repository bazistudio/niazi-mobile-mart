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
import { buildAuthMiddleware, authorizePermission, isOrgAdmin } from '../auth';
import { ExpenseService, ExpenseServiceError } from '../services/expense.service';
import type { ExpenseFilterDto, UpdateExpenseDto, ExpenseSummary } from '../services/expense.service';
// Workstream C: writeChangeLogEntry removed from routes — now called inside the
// database transaction in expense.repo.ts for atomicity. Import no longer needed here.

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

  // All expense routes require authentication + active-account enforcement
  router.use(buildAuthMiddleware(pool));

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

    const orgAdmin = isOrgAdmin(identity);

    const requested = requestedBranchId?.trim() ?? null;

    if (requested) {
      if (!orgAdmin && identity.branch_id && identity.branch_id !== requested) {
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

    const identity = req.identity!;
    const orgAdmin = isOrgAdmin(identity);
    const requestedBranchId = req.query['branch_id'] as string | undefined;
    const effectiveBranchId = resolveBranch(req, res, requestedBranchId);
    if (effectiveBranchId === 'UNAUTHORIZED') return;

    // FEATURE-01: ADMIN org-wide — when no branch is specified, scope by organization_id
    // Non-ADMIN users always see only their branch (enforced by resolveBranch + branch_id filter)
    const organizationId: string | null =
      orgAdmin && !effectiveBranchId
        ? (identity.organization_id ?? null)
        : null;

    const filter: ExpenseFilterDto = {
      category_id: (req.query['category_id'] as string | undefined) ?? null,
      branch_id: effectiveBranchId,
      organization_id: organizationId,
      // FEATURE-01: created_by_user_id filter — only ADMIN may filter by other users
      created_by_user_id: orgAdmin
        ? ((req.query['created_by_user_id'] as string | undefined) ?? null)
        : null,
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
    // Validate branch resolution — every expense must belong to a valid branch
    if (!effectiveBranchId) {
      res.status(400).json({ error: 'branch_id is required' });
      return;
    }

    // Validate required fields early for clear 400 messages
    if (!body['category_id'] || typeof body['category_id'] !== 'string') {
      res.status(400).json({ error: 'category_id is required' });
      return;
    }
    if (body['amount'] === undefined || body['amount'] === null) {
      res.status(400).json({ error: 'amount is required' });
      return;
    }

    // Description is optional — trim if string, otherwise default to empty string
    const description =
      typeof body['description'] === 'string'
        ? body['description'].trim()
        : '';

    try {
      // Workstream C: organizationId is now threaded into the service/repo so the
      // audit log is written inside the database transaction — not in setImmediate.
      const expense = await service.createExpense(
        {
          category_id: body['category_id'] as string,
          branch_id: effectiveBranchId,
          amount: Number(body['amount']),
          quantity: body['quantity'] !== undefined && body['quantity'] !== null ? Number(body['quantity']) : null,
          unit_price: body['unit_price'] !== undefined && body['unit_price'] !== null ? Number(body['unit_price']) : null,
          payment_method:
            (body['payment_method'] as string | null | undefined) ?? null,
          description,
          notes: (body['notes'] as string | null | undefined) ?? null,
          expense_date: (body['expense_date'] as string | null | undefined) ?? null,
        },
        identity.user_id,
        identity.organization_id ?? null  // Workstream C: in-transaction audit log
      );
      res.status(201).json(expense);
    } catch (err: unknown) {
      handleError(res, err, 'create_expense');
    }
  });

  // -------------------------------------------------------------------------
  // GET /summary — Authoritative expense summary (EXP-M02)
  // Returns aggregated totals for the resolved branch (or org if ADMIN).
  // Permission: expenses (no sub-permission)
  // MUST be registered BEFORE GET /:id to avoid path collision.
  // -------------------------------------------------------------------------

  router.get('/summary', async (req: Request, res: Response): Promise<void> => {
    if (!requireExpensePermission(req, res)) return;

    const identity = req.identity!;
    const orgAdmin = isOrgAdmin(identity);
    const requestedBranchId = req.query['branch_id'] as string | undefined;
    const effectiveBranchId = resolveBranch(req, res, requestedBranchId);
    if (effectiveBranchId === 'UNAUTHORIZED') return;

    // FEATURE-01: ADMIN org-wide summary — when no branch specified, use organization_id scope
    const organizationId: string | null =
      orgAdmin && !effectiveBranchId
        ? (identity.organization_id ?? null)
        : null;

    const filter: ExpenseFilterDto = {
      branch_id: effectiveBranchId,
      organization_id: organizationId,
      category_id: (req.query['category_id'] as string | undefined) ?? null,
      start_date: (req.query['start_date'] as string | undefined) ?? null,
      end_date: (req.query['end_date'] as string | undefined) ?? null,
    };

    try {
      const summary: ExpenseSummary = await service.getExpenseSummary(filter);
      res.status(200).json(summary);
    } catch (err: unknown) {
      handleError(res, err, 'get_expense_summary');
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

    // SEC-01: Fail closed — organization_id must be present in JWT
    if (!identity.organization_id) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Organization identity missing' });
      return;
    }

    try {
      const expense = await service.getExpenseById(id);

      // SEC-01: Organization boundary check — applies to ALL roles including ADMIN
      // Prevents cross-organization expense access even when user has ADMIN role.
      // branch_organization_id is derived from persisted branches table (server-side JOIN),
      // never from client-supplied data.
      if (!expense.branch_organization_id || expense.branch_organization_id !== identity.organization_id) {
        res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Access to this expense is not authorized',
        });
        return;
      }

      // Branch access check — mirrors IPC expense_get_by_id branch check (non-ADMIN only)
      if (!isOrgAdmin(identity) && identity.branch_id && expense.branch_id !== identity.branch_id) {
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
  // PUT /:id — Edit an expense (EXP-FIX-05)
  // Append-only cash corrections applied atomically.
  // Reuses expense:create permission (no separate expense:update permission).
  // Returns 200 with updated expense.
  // -------------------------------------------------------------------------

  router.put('/:id', async (req: Request, res: Response): Promise<void> => {
    if (!requireExpenseCreatePermission(req, res)) return;

    const identity = req.identity!;
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;

    // SEC-01: Fail closed — organization_id must be present in JWT
    if (!identity.organization_id) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Organization identity missing' });
      return;
    }

    // Authorization check: load existing expense (org boundary + branch access)
    try {
      const existing = await service.getExpenseById(id);

      // SEC-01: Organization boundary check — applies to ALL roles including ADMIN
      // branch_organization_id comes from a server-side JOIN, never from the client.
      if (!existing.branch_organization_id || existing.branch_organization_id !== identity.organization_id) {
        res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Access to this expense is not authorized',
        });
        return;
      }

      // Branch access check for non-ADMIN users (pre-existing behavior preserved)
      if (!isOrgAdmin(identity) && identity.branch_id && existing.branch_id !== identity.branch_id) {
        res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Access to this branch is not authorized',
        });
        return;
      }

      const dto: UpdateExpenseDto = {
        category_id: body['category_id'] !== undefined ? (body['category_id'] as string | null) : undefined,
        amount: body['amount'] !== undefined && body['amount'] !== null ? Number(body['amount']) : undefined,
        quantity: body['quantity'] !== undefined ? (body['quantity'] !== null ? Number(body['quantity']) : null) : undefined,
        unit_price: body['unit_price'] !== undefined ? (body['unit_price'] !== null ? Number(body['unit_price']) : null) : undefined,
        payment_method: body['payment_method'] !== undefined ? (body['payment_method'] as string | null) : undefined,
        description: body['description'] !== undefined ? (body['description'] as string) : undefined,
        notes: body['notes'] !== undefined ? (body['notes'] as string | null) : undefined,
        expense_date: body['expense_date'] !== undefined ? (body['expense_date'] as string | null) : undefined,
        reason: (body['reason'] as string | null | undefined) ?? null,
      };

      const updated = await service.updateExpense(
        id,
        dto,
        identity.user_id,
        identity.organization_id ?? null
      );
      res.status(200).json(updated);
    } catch (err: unknown) {
      handleError(res, err, 'update_expense');
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

      if (!isOrgAdmin(identity) && identity.branch_id && existing.branch_id !== identity.branch_id) {
        res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Access to this branch is not authorized',
        });
        return;
      }

      // EXP-FIX-06: accept optional reason from request body, persist to change_log
      const reason = typeof (req.body as Record<string, unknown>)['reason'] === 'string'
        ? ((req.body as Record<string, unknown>)['reason'] as string).trim() || null
        : null;

      // Workstream C: organizationId threaded to repo for in-transaction audit log.
      const cancelled = await service.cancelExpense(
        id,
        identity.user_id,
        identity.organization_id ?? null,
        reason
      );
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
