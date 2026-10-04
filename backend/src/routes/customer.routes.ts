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
 * Note: record_customer_payment is NOT exposed here.
 * Rust customer_service.rs line 281: Postgres path returns
 * Err(AppError::Internal("Postgres record_customer_payment not implemented")).
 * That endpoint does not exist on the central server — it is SQLite/desktop only.
 *
 * Error response shape mirrors Axum handlers:
 *   403: { error: "FORBIDDEN",      message: "..." }
 *   404: { error: "NOT_FOUND",      message: "..." }
 *   400: { error: "CREATE_FAILED",  message: "..." } (on create)
 *   500: { error: "SERVER_ERROR",   message: "..." }
 */

import express, { Router, Request, Response } from 'express';
import { Pool } from 'pg';

import { authMiddleware, authorizePermission, RequestIdentity } from '../auth';
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
} from '../repositories/customer.repo';

import { proxyToCentralServer } from '../server';

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

function sendError(req: Request, res: Response, err: unknown): void {
  console.error('[customer.routes] Error handled by sendError:', err);
  if (isDbConnectionError(err)) {
    if (req.method === 'GET' || req.method === 'HEAD') {
      console.warn('[customer.routes] DB connection unavailable on read; proxying to Central Server...');
      proxyToCentralServer(req, res);
      return;
    }
    console.error('[customer.routes] DB connection error on write route — returning 502, NOT proxying to prevent duplicate data');
    res.status(502).json({
      error: 'Database connection error',
      message: 'Write outcome is unknown. The operation was not automatically retried to prevent duplicate data.',
    });
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

  // Apply JWT authentication middleware to all customer routes
  router.use(authMiddleware);

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
    } catch (err) {
      // Rust: Err(e) => (StatusCode::BAD_REQUEST, Json(json!({"error": "CREATE_FAILED", "message": e})))
      if (err instanceof CustomerRepoError) {
        res.status(400).json({ error: 'CREATE_FAILED', message: err.message });
        return;
      }
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

  router.use(authMiddleware);

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
      // Rust: customer_service.get_statement(&id) — full chronological statement
      const statement = await getCustomerStatement(pool, id);
      res.status(200).json(statement);
    } catch (err) {
      if (err instanceof CustomerRepoError && err.statusCode === 404) {
        res.status(404).json({ error: 'NOT_FOUND', message: err.message });
        return;
      }
      sendError(req, res, err);
    }
  });

  return router;
}
