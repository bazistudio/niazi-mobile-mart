/**
 * Supplier Routes — TypeScript Express router (Phase 2 migration)
 *
 * TypeScript is now the ONLINE AUTHORITY for Supplier operations.
 * These routes replace the following Rust Axum handlers (server.rs):
 *
 *   GET  /api/suppliers            → list_suppliers_handler (with SupplierFilter query params)
 *   POST /api/suppliers            → create_supplier_handler
 *   GET  /api/v1/suppliers/:id     → get_supplier_detail_handler → SupplierDetailDto
 *   GET  /api/v1/suppliers/:id/ledger → get_supplier_ledger_handler → SupplierStatementDto
 *
 * Additional routes implemented (not in current Rust HTTP surface but
 * required for complete Supplier CRUD):
 *   PUT    /:id                    → update supplier
 *   DELETE /:id                    → deactivate supplier
 *   GET    /search                 → search suppliers (registered BEFORE /:id)
 *
 * Registered at BOTH /api/suppliers and /api/v1/suppliers for backward compat.
 *
 * Authorization:
 *   All routes require valid JWT (authMiddleware).
 *   All routes require permission page "suppliers" (mirrors Rust authorize_permission).
 *   Mirrors: auth.0.authorize_permission(Some("suppliers"), None) in server.rs.
 *
 * IMPORTANT: DO NOT add Party domain logic here.
 *            DO NOT add payment recording logic here (Purchase domain, Phase N).
 *            DO NOT add new Supplier features beyond existing behavior.
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { authMiddleware, authorizePermission } from '../auth';
import { SupplierService, SupplierServiceError } from '../services/supplier.service';
import type { SupplierFilter } from '../services/supplier.service';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build the supplier router bound to the given PostgreSQL pool.
 * Mount at BOTH /api/suppliers and /api/v1/suppliers.
 */
export function buildSupplierRouter(pool: Pool): Router {
  const router = Router();
  const service = new SupplierService(pool);

  // All supplier routes require authentication
  router.use(authMiddleware);

  // Authorization helper — mirrors authorize_permission(Some("suppliers"), None)
  function requireSuppliersPermission(req: Request, res: Response): boolean {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Not authenticated' });
      return false;
    }
    const err = authorizePermission(identity, 'suppliers', null);
    if (err) {
      res.status(403).json({ error: 'FORBIDDEN', message: err });
      return false;
    }
    return true;
  }

  // -------------------------------------------------------------------------
  // GET /search — Search suppliers
  // MUST be registered BEFORE GET /:id to avoid path collision.
  // Mirrors storage_supplier_search IPC command.
  // -------------------------------------------------------------------------

  router.get('/search', async (req: Request, res: Response): Promise<void> => {
    if (!requireSuppliersPermission(req, res)) return;

    const query = (req.query['q'] as string | undefined) ?? (req.query['query'] as string | undefined) ?? '';

    try {
      const results = await service.searchSuppliers(query);
      res.status(200).json(results);
    } catch (err: unknown) {
      handleError(res, err, 'search_suppliers');
    }
  });

  // -------------------------------------------------------------------------
  // GET / — List suppliers
  // Mirrors list_suppliers_handler (server.rs:994-1008)
  // Query params: search, is_active, limit, offset
  // -------------------------------------------------------------------------

  router.get('/', async (req: Request, res: Response): Promise<void> => {
    if (!requireSuppliersPermission(req, res)) return;

    const filter: SupplierFilter = {
      search: (req.query['search'] as string | undefined) ?? null,
      is_active: parseOptionalBool(req.query['is_active'] as string | undefined),
      limit: parseOptionalInt(req.query['limit'] as string | undefined),
      offset: parseOptionalInt(req.query['offset'] as string | undefined),
    };

    try {
      const suppliers = await service.listSuppliers(filter);
      res.status(200).json(suppliers);
    } catch (err: unknown) {
      handleError(res, err, 'list_suppliers');
    }
  });

  // -------------------------------------------------------------------------
  // POST / — Create supplier
  // Mirrors create_supplier_handler (server.rs:1010-1024)
  // Returns 201 with created Supplier on success.
  // -------------------------------------------------------------------------

  router.post('/', async (req: Request, res: Response): Promise<void> => {
    if (!requireSuppliersPermission(req, res)) return;

    const body = req.body as Record<string, unknown>;

    if (typeof body['name'] !== 'string' || !String(body['name']).trim()) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    if (typeof body['phone'] !== 'string' || !String(body['phone']).trim()) {
      res.status(400).json({ error: 'phone is required' });
      return;
    }

    try {
      const supplier = await service.createSupplier({
        name: body['name'] as string,
        phone: body['phone'] as string,
        alternate_phone: (body['alternate_phone'] as string | null | undefined) ?? null,
        email: (body['email'] as string | null | undefined) ?? null,
        address: (body['address'] as string | null | undefined) ?? null,
        notes: (body['notes'] as string | null | undefined) ?? null,
        credit_limit: body['credit_limit'] !== undefined ? Number(body['credit_limit']) : 0,
      });
      res.status(201).json(supplier);
    } catch (err: unknown) {
      handleError(res, err, 'create_supplier');
    }
  });

  // -------------------------------------------------------------------------
  // GET /:id — Get supplier detail (with financial stats)
  // Mirrors get_supplier_detail_handler (server.rs:1063-1079)
  // Returns SupplierDetailDto.
  // -------------------------------------------------------------------------

  router.get('/:id', async (req: Request, res: Response): Promise<void> => {
    if (!requireSuppliersPermission(req, res)) return;

    const { id } = req.params as { id: string };

    try {
      const detail = await service.getSupplierDetail(id);
      res.status(200).json(detail);
    } catch (err: unknown) {
      handleError(res, err, 'get_supplier_detail');
    }
  });

  // -------------------------------------------------------------------------
  // GET /:id/ledger — Get supplier statement
  // Mirrors get_supplier_ledger_handler (server.rs:1081-1097)
  // Returns SupplierStatementDto (not raw ledger array).
  // -------------------------------------------------------------------------

  router.get('/:id/ledger', async (req: Request, res: Response): Promise<void> => {
    if (!requireSuppliersPermission(req, res)) return;

    const { id } = req.params as { id: string };

    try {
      const statement = await service.getStatement(id);
      res.status(200).json(statement);
    } catch (err: unknown) {
      handleError(res, err, 'get_supplier_ledger');
    }
  });

  // -------------------------------------------------------------------------
  // PUT /:id — Update supplier
  // HTTP equivalent of storage_supplier_update IPC command.
  // -------------------------------------------------------------------------

  router.put('/:id', async (req: Request, res: Response): Promise<void> => {
    if (!requireSuppliersPermission(req, res)) return;

    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;

    try {
      const updated = await service.updateSupplier(id, {
        name: body['name'] !== undefined ? (body['name'] as string) : undefined,
        phone: body['phone'] !== undefined ? (body['phone'] as string) : undefined,
        alternate_phone: body['alternate_phone'] !== undefined ? (body['alternate_phone'] as string | null) : undefined,
        email: body['email'] !== undefined ? (body['email'] as string | null) : undefined,
        address: body['address'] !== undefined ? (body['address'] as string | null) : undefined,
        notes: body['notes'] !== undefined ? (body['notes'] as string | null) : undefined,
        credit_limit: body['credit_limit'] !== undefined ? Number(body['credit_limit']) : undefined,
        is_active: body['is_active'] !== undefined ? Boolean(body['is_active']) : undefined,
      });
      res.status(200).json(updated);
    } catch (err: unknown) {
      handleError(res, err, 'update_supplier');
    }
  });

  // -------------------------------------------------------------------------
  // DELETE /:id — Deactivate supplier (soft delete)
  // HTTP equivalent of storage_supplier_deactivate IPC command.
  // Mirrors PostgresSupplierRepository::deactivate_supplier.
  // -------------------------------------------------------------------------

  router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
    if (!requireSuppliersPermission(req, res)) return;

    const { id } = req.params as { id: string };

    try {
      await service.deactivateSupplier(id);
      res.status(200).json({ message: 'Supplier deactivated successfully' });
    } catch (err: unknown) {
      handleError(res, err, 'deactivate_supplier');
    }
  });

  return router;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function handleError(res: Response, err: unknown, operation: string): void {
  if (err instanceof SupplierServiceError) {
    const body: Record<string, unknown> = { error: err.message };
    if (err.code) body['code'] = err.code;
    res.status(err.statusCode).json(body);
    return;
  }
  console.error(`[supplier/${operation}] Unexpected error:`, err);
  res.status(500).json({ error: 'Internal server error' });
}

function parseOptionalBool(value: string | undefined): boolean | null {
  if (value === undefined || value === null) return null;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return null;
}

function parseOptionalInt(value: string | undefined): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = parseInt(value, 10);
  return isNaN(n) ? null : n;
}
