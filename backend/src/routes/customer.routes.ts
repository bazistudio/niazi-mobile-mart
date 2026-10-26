/**
 * Customer HTTP route handlers.
 * Mirrors Axum customer handlers in src-tauri/src/bin/server.rs.
 *
 * Registered routes (exact HTTP contract preserved):
 *   GET    /api/customers            → listCustomers      (auth: customers page)
 *   POST   /api/customers            → createCustomer     (auth: customers page)
 *   GET    /api/v1/customers/:id     → getCustomerDetail  (auth: customers page)
 *   GET    /api/v1/customers/:id/ledger → getCustomerStatement (auth: customers page)
 *
 *   POST   /api/v1/customers/:id/payments → recordCustomerPayment (auth: customers page)
 *
 * Error response shape mirrors Axum handlers:
 *   403: { error: "FORBIDDEN",      message: "..." }
 *   404: { error: "NOT_FOUND",      message: "..." }
 *   400: { error: "CREATE_FAILED",  message: "..." } (on create)
 *   500: { error: "SERVER_ERROR",   message: "..." }
 */

import express, { Router, Request, Response } from 'express';
import { Pool } from 'pg';

import { buildAuthMiddleware, authorizePermission, isOrgAdmin, canAccessBranch, RequestIdentity } from '../auth';
import { writeChangeLogEntry } from '../repositories/change_log.repo';
import {
  CustomerRepoError,
  CustomerFilter,
  CreateCustomerDto,
  UpdateCustomerDto,
  createCustomer,
  getCustomerById,
  getCustomerDetail,
  listCustomers,
  searchCustomers,
  updateCustomer,
  deactivateCustomer,
  getCustomerStatement,
  validateCreateCustomer,
  validateUpdateCustomer,
  recordCustomerPayment,
  RecordCustomerPaymentDto,
  setCustomerOpeningBalance,
  SetOpeningBalanceDto,
} from '../repositories/customer.repo';

// ─── Error Response Helper ────────────────────────────────────────────────────

function isDbConnectionError(err: unknown): boolean {
  if (!err) return false;
  const msg = (err as { message?: string }).message || String(err);
  const code = (err as { code?: string }).code;
  return (
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    msg.includes('ECONNRESET') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('Connection terminated')
  );
}

function sendError(_req: Request, res: Response, err: unknown): void {
  console.error('[customer.routes] Error handled by sendError:', err);
  if (isDbConnectionError(err)) {
    res.status(503).json({ error: 'Database service unavailable', message: (err as Error).message });
    return;
  }
  if (err instanceof CustomerRepoError) {
    // Map HTTP status to Rust error response shape
    if (err.statusCode === 404) {
      res.status(404).json({ error: 'NOT_FOUND', message: err.message });
      return;
    }
    if (err.statusCode === 409) {
      res.status(400).json({ error: 'CREATE_FAILED', message: err.message });
      return;
    }
    if (err.statusCode === 400) {
      res.status(400).json({ error: 'CREATE_FAILED', message: err.message });
      return;
    }
    res.status(err.statusCode).json({ error: 'SERVER_ERROR', message: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({ error: 'SERVER_ERROR', message });
}

// ─── Router Factory ───────────────────────────────────────────────────────────

export function createCustomerRouter(pool: Pool): Router {
  const router = express.Router();

  // Apply authentication + active-account middleware to all customer routes
  router.use(buildAuthMiddleware(pool));

  // ── GET /api/customers ─────────────────────────────────────────────────────
  // Mirrors list_customers_handler in server.rs.
  // Auth: customers page permission.
  // Query params: search, is_active, limit, offset (CustomerFilter shape).
  // Returns: 200 + CustomerSummaryDto[]
  // Error: 500 SERVER_ERROR on internal failure.
  router.get('/', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    // Rust: auth.0.authorize_permission(Some("customers"), None)
    const denied = authorizePermission(identity, 'customers', null);
    if (denied) {
      res.status(403).json({ error: 'FORBIDDEN', message: denied });
      return;
    }

    try {
      // Parse CustomerFilter from query params (mirrors Axum Query<CustomerFilter> extractor)
      const filter: CustomerFilter = {
        search: (req.query['search'] as string) || null,
        is_active:
          req.query['is_active'] !== undefined
            ? req.query['is_active'] === 'true' || req.query['is_active'] === '1'
            : null,
        limit: req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : null,
        offset: req.query['offset'] ? parseInt(req.query['offset'] as string, 10) : null,
      };

      const customers = await listCustomers(pool, filter);
      res.status(200).json(customers);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── POST /api/customers ────────────────────────────────────────────────────
  // Mirrors create_customer_handler in server.rs.
  // Auth: customers page permission.
  // Body: CreateCustomerDto
  // Returns: 201 + Customer on success.
  // Error: 400 CREATE_FAILED on validation or conflict; 500 SERVER_ERROR.
  router.post('/', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'customers', null);
    if (denied) {
      res.status(403).json({ error: 'FORBIDDEN', message: denied });
      return;
    }

    try {
      const dto = req.body as CreateCustomerDto;

      // Service-layer validation (mirrors customer_service.rs create_customer validation)
      const validationErr = validateCreateCustomer(dto);
      if (validationErr) {
        res.status(400).json({ error: 'CREATE_FAILED', message: validationErr });
        return;
      }

      const customer = await createCustomer(pool, dto);
      res.status(201).json(customer);

      setImmediate(() => {
        const orgId = identity.organization_id;
        const branchId = identity.branch_id;
        if (orgId && branchId) {
          pool.connect().then(cl => {
            cl.query('BEGIN')
              .then(() => writeChangeLogEntry(cl, {
                organizationId: orgId,
                branchId,
                eventType: 'CUSTOMER_CREATED',
                entityType: 'customer',
                entityId: customer.id,
                payloadStr: JSON.stringify({ customer_id: customer.id, name: customer.name }),
              }))
              .then(() => cl.query('COMMIT'))
              .catch(() => cl.query('ROLLBACK').catch(() => {}))
              .finally(() => cl.release());
          }).catch(() => {});
        }
      });
    } catch (err) {
      // Rust: Err(e) => (StatusCode::BAD_REQUEST, Json(json!({"error": "CREATE_FAILED", "message": e})))
      if (err instanceof CustomerRepoError) {
        res.status(400).json({ error: 'CREATE_FAILED', message: err.message });
        return;
      }
      sendError(req, res, err);
    }
  });

  // ── PUT /api/customers/:id ──────────────────────────────────────────────────
  router.put('/:id', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'customers', null);
    if (denied) {
      res.status(403).json({ error: 'FORBIDDEN', message: denied });
      return;
    }

    try {
      const id = req.params['id'] as string;
      const dto = req.body as UpdateCustomerDto;

      const validationErr = validateUpdateCustomer(dto);
      if (validationErr) {
        res.status(400).json({ error: 'UPDATE_FAILED', message: validationErr });
        return;
      }

      const updated = await updateCustomer(pool, id, dto);
      res.status(200).json(updated);

      setImmediate(() => {
        const orgId = identity.organization_id;
        const branchId = identity.branch_id;
        if (orgId && branchId) {
          pool.connect().then(cl => {
            cl.query('BEGIN')
              .then(() => writeChangeLogEntry(cl, {
                organizationId: orgId,
                branchId,
                eventType: 'CUSTOMER_UPDATED',
                entityType: 'customer',
                entityId: updated.id,
                payloadStr: JSON.stringify({ customer_id: updated.id, name: updated.name }),
              }))
              .then(() => cl.query('COMMIT'))
              .catch(() => cl.query('ROLLBACK').catch(() => {}))
              .finally(() => cl.release());
          }).catch(() => {});
        }
      });
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── DELETE /api/customers/:id ───────────────────────────────────────────────
  router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'customers', null);
    if (denied) {
      res.status(403).json({ error: 'FORBIDDEN', message: denied });
      return;
    }

    try {
      const id = req.params['id'] as string;
      await deactivateCustomer(pool, id);
      res.status(200).json({ success: true, message: 'Customer deactivated successfully' });

      setImmediate(() => {
        const orgId = identity.organization_id;
        const branchId = identity.branch_id;
        if (orgId && branchId) {
          pool.connect().then(cl => {
            cl.query('BEGIN')
              .then(() => writeChangeLogEntry(cl, {
                organizationId: orgId,
                branchId,
                eventType: 'CUSTOMER_UPDATED',
                entityType: 'customer',
                entityId: id,
                payloadStr: JSON.stringify({ customer_id: id, is_active: false }),
              }))
              .then(() => cl.query('COMMIT'))
              .catch(() => cl.query('ROLLBACK').catch(() => {}))
              .finally(() => cl.release());
          }).catch(() => {});
        }
      });
    } catch (err) {
      sendError(req, res, err);
    }
  });

  return router;
}

/**
 * Creates the v1 customer detail router.
 * Routes mounted at /api/v1/customers in server.ts.
 *
 * Mirrors:
 *   GET /api/v1/customers/:id         → get_customer_detail_handler
 *   GET /api/v1/customers/:id/ledger  → get_customer_ledger_handler
 */
export function createCustomerV1Router(pool: Pool): Router {
  const router = express.Router();

  router.use(buildAuthMiddleware(pool));

  // ── GET /api/v1/customers/:id ─────────────────────────────────────────────
  // Mirrors get_customer_detail_handler in server.rs.
  // Auth: customers page permission.
  // Returns: 200 + CustomerDetailDto
  // Error: 404 NOT_FOUND if customer missing; 500 SERVER_ERROR.
  router.get('/:id', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'customers', null);
    if (denied) {
      res.status(403).json({ error: 'FORBIDDEN', message: denied });
      return;
    }

    try {
      const id = req.params['id'] as string;
      const detail = await getCustomerDetail(pool, id);
      res.status(200).json(detail);
    } catch (err) {
      if (err instanceof CustomerRepoError && err.statusCode === 404) {
        res.status(404).json({ error: 'NOT_FOUND', message: err.message });
        return;
      }
      sendError(req, res, err);
    }
  });

  // ── GET /api/v1/customers/:id/ledger ─────────────────────────────────────
  // Mirrors get_customer_ledger_handler in server.rs.
  // Note: despite the route name "ledger", Rust calls customer_service.get_statement()
  //       which returns CustomerStatementDto (chronological, all entries).
  // Auth: customers page permission.
  // Returns: 200 + CustomerStatementDto
  // Error: 404 NOT_FOUND if customer missing; 500 SERVER_ERROR.
  router.get('/:id/ledger', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'customers', null);
    if (denied) {
      res.status(403).json({ error: 'FORBIDDEN', message: denied });
      return;
    }

    try {
      const id = req.params['id'] as string;
      const callerIsOrgAdmin = isOrgAdmin(identity);
      const requestedBranchId = (req.query['branch_id'] as string)?.trim() || undefined;

      let effectiveBranchId: string | null = null;
      if (callerIsOrgAdmin) {
        if (requestedBranchId) {
          if (!canAccessBranch(identity, requestedBranchId)) {
            res.status(403).json({ error: 'FORBIDDEN', message: 'Access to this branch is not authorized' });
            return;
          }
          effectiveBranchId = requestedBranchId;
        } else {
          // Org Admin without branch_id query parameter views organization-wide ledger (all branches)
          effectiveBranchId = null;
        }
      } else {
        // Non-org-admin users are strictly locked to their assigned branch_id.
        // If client sends a different branch_id, reject with 403 Forbidden.
        if (requestedBranchId && requestedBranchId !== identity.branch_id) {
          res.status(403).json({ error: 'FORBIDDEN', message: 'Cannot access ledger data for a foreign branch' });
          return;
        }
        if (!identity.branch_id) {
          res.status(403).json({ error: 'FORBIDDEN', message: 'No branch assigned to your account' });
          return;
        }
        effectiveBranchId = identity.branch_id;
      }

      // Rust: customer_service.get_statement(&id) — statement filtered by authorized branch if specified
      const statement = await getCustomerStatement(pool, id, effectiveBranchId);
      res.status(200).json(statement);
    } catch (err) {
      if (err instanceof CustomerRepoError && err.statusCode === 404) {
        res.status(404).json({ error: 'NOT_FOUND', message: err.message });
        return;
      }
      sendError(req, res, err);
    }
  });

  // ── PUT /api/v1/customers/:id ───────────────────────────────────────────────
  router.put('/:id', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'customers', null);
    if (denied) {
      res.status(403).json({ error: 'FORBIDDEN', message: denied });
      return;
    }

    try {
      const id = req.params['id'] as string;
      const dto = req.body as UpdateCustomerDto;

      const validationErr = validateUpdateCustomer(dto);
      if (validationErr) {
        res.status(400).json({ error: 'UPDATE_FAILED', message: validationErr });
        return;
      }

      const updated = await updateCustomer(pool, id, dto);
      res.status(200).json(updated);
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── DELETE /api/v1/customers/:id ────────────────────────────────────────────
  router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'customers', null);
    if (denied) {
      res.status(403).json({ error: 'FORBIDDEN', message: denied });
      return;
    }

    try {
      const id = req.params['id'] as string;
      await deactivateCustomer(pool, id);
      res.status(200).json({ success: true, message: 'Customer deactivated successfully' });
    } catch (err) {
      sendError(req, res, err);
    }
  });

  // ── POST /api/v1/customers/:id/payments ──────────────────────────────────
  // Records a customer receivable payment.
  // Auth: customers page permission.
  // Body: { amount: number, payment_method: string, notes?: string, reference_number?: string }
  // Returns: 201 + CustomerPaymentResult { payment_id, reference_number, new_balance }
  // Error: 400 on invalid amount; 404 NOT_FOUND if customer missing; 500 SERVER_ERROR.
  router.post('/:id/payments', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as RequestIdentity;

    const denied = authorizePermission(identity, 'customers', null);
    if (denied) {
      res.status(403).json({ error: 'FORBIDDEN', message: denied });
      return;
    }

    try {
      const customerId = req.params['id'] as string;
      const body = req.body as RecordCustomerPaymentDto;

      // Validate required fields
      if (typeof body.amount !== 'number' || body.amount <= 0) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'amount must be a positive number' });
        return;
      }
      if (!body.payment_method || typeof body.payment_method !== 'string') {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'payment_method is required' });
        return;
      }

      // Resolve branch: Org Admin can target a specified branch (validated with canAccessBranch);
      // Non-org-admin is locked to identity.branch_id.
      const requestedBranchId =
        (req.query['branch_id'] as string | undefined)?.trim() ||
        (body as any)?.branch_id?.trim() ||
        (req.headers['x-branch-id'] as string | undefined)?.trim() ||
        undefined;

      let effectiveBranchId = identity.branch_id ?? null;
      if (isOrgAdmin(identity)) {
        if (requestedBranchId) {
          if (!canAccessBranch(identity, requestedBranchId)) {
            res.status(403).json({ error: 'FORBIDDEN', message: 'Access to this branch is not authorized' });
            return;
          }
          effectiveBranchId = requestedBranchId;
        }
      } else if (requestedBranchId && requestedBranchId !== identity.branch_id) {
        res.status(403).json({ error: 'FORBIDDEN', message: 'Cannot record payment for a foreign branch' });
        return;
      }

      const result = await recordCustomerPayment(
        pool,
        customerId,
        {
          amount: Math.round(body.amount),
          payment_method: body.payment_method.toUpperCase(),
          notes: body.notes ?? null,
          reference_number: body.reference_number ?? null,
        },
        identity.user_id ?? null,
        effectiveBranchId
      );

      res.status(201).json(result);
    } catch (err) {
      if (err instanceof CustomerRepoError && err.statusCode === 404) {
        res.status(404).json({ error: 'NOT_FOUND', message: err.message });
        return;
      }
      sendError(req, res, err);
    }
  });

  // ── POST /api/v1/customers/:id/opening-balance ────────────────────────────
  // Records the single opening-balance ledger entry for a customer with no
  // prior ledger activity.  Organization-admin only.
  //
  // Authorization:
  //   - Authenticated (buildAuthMiddleware above).
  //   - isOrgAdmin() enforced server-side; non-admins receive HTTP 403.
  //
  // Body: SetOpeningBalanceDto
  //   { amount: number, direction: 'debit'|'credit',
  //     balance_as_of: string, notes: string, reference_number?: string }
  //
  // Returns: 201 + SetOpeningBalanceResult on success.
  // Errors:
  //   400 – validation failure (amount, direction, date format, missing notes)
  //   403 – caller is not an org-admin
  //   404 – customer not found
  //   409 – customer already has ledger entries or opening balance already posted
  //   500 – unexpected server error
  router.post('/:id/opening-balance', async (req: Request, res: Response): Promise<void> => {
    const identity = req.identity as import('../auth').RequestIdentity;

    // ── Authorization: org-admin only ────────────────────────────────────
    if (!isOrgAdmin(identity)) {
      res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Only organization administrators may set a customer opening balance',
      });
      return;
    }

    try {
      const customerId = req.params['id'] as string;
      const body = req.body as Partial<SetOpeningBalanceDto>;

      // ── Request-level validation ────────────────────────────────────────
      if (typeof body.amount !== 'number' || !Number.isFinite(body.amount)) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'amount must be a number' });
        return;
      }
      if (body.amount <= 0 || !Number.isInteger(body.amount)) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'amount must be a positive integer (whole rupees; no decimals or zero)',
        });
        return;
      }
      if (body.direction !== 'debit' && body.direction !== 'credit') {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: "direction must be 'debit' (customer owes shop) or 'credit' (shop owes customer)",
        });
        return;
      }
      if (!body.balance_as_of || typeof body.balance_as_of !== 'string') {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'balance_as_of is required' });
        return;
      }
      if (!body.notes || typeof body.notes !== 'string' || !body.notes.trim()) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'notes is required and must not be empty' });
        return;
      }

      const dto: SetOpeningBalanceDto = {
        amount:           Math.round(body.amount),
        direction:        body.direction,
        balance_as_of:    body.balance_as_of.trim(),
        notes:            body.notes.trim(),
        reference_number: typeof body.reference_number === 'string' ? body.reference_number.trim() || null : null,
      };

      const result = await setCustomerOpeningBalance(
        pool,
        customerId,
        dto,
        identity.user_id ?? null,
        identity.branch_id ?? null
      );

      res.status(201).json(result);
    } catch (err) {
      // 409 must be returned as HTTP 409 (not 400 like sendError maps it).
      // Check explicitly before delegating to sendError.
      if (err instanceof CustomerRepoError) {
        if (err.statusCode === 404) {
          res.status(404).json({ error: 'NOT_FOUND', message: err.message });
          return;
        }
        if (err.statusCode === 409) {
          res.status(409).json({ error: 'DUPLICATE_OPENING_BALANCE', message: err.message });
          return;
        }
        if (err.statusCode === 400) {
          res.status(400).json({ error: 'VALIDATION_ERROR', message: err.message });
          return;
        }
      }
      sendError(req, res, err);
    }
  });

  return router;
}
