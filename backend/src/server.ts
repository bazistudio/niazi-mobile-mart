/**
 * TypeScript Backend -- Entry Point
 *
 * Standalone Express server serving TypeScript-owned domain HTTP routes.
 * Routes not handled here are transparently proxied to the Rust Axum backend.
 *
 * TypeScript-owned routes (Phase 1 migration):
 *   /api/auth       -> Authentication (login, JWT issuance, user identity)
 *   /api/v1/auth    -> Authentication (v1 alias, matches Rust Axum registration)
 *   /api/users      -> User management (CRUD, approve/reject, credentials)
 *   /api/v1/users   -> User management (v1 alias)
 *   /api/products   -> Product CRUD
 *   /api/v1/products -> Product CRUD (v1 alias)
 *   ... (other domains)
 *
 * TypeScript-owned routes (Phase 2 migration):
 *   /api/suppliers    -> Supplier CRUD + ledger (TypeScript is online authority)
 *   /api/v1/suppliers -> Supplier (v1 alias)
 *
 * TypeScript-owned routes (Phase 3 migration):
 *   /api/expenses     -> Expense CRUD + categories + cancel (TypeScript is online authority)
 *   /api/v1/expenses  -> Expense (v1 alias — Rust only had /api/expenses, v1 alias added here)
 *
 * TypeScript-owned routes (Phase 4 migration):
 *   /api/branches     -> Branch CRUD (TypeScript is online authority)
 *   /api/v1/branches  -> Branch (v1 alias)
 *   /api/shops        -> Branch (alias for /api/branches)
 *   /api/users        -> User management extended: suspend, change-pin, permissions
 *   /api/v1/users     -> User (v1 alias)
 *
 * Environment variables required:
 *   DATABASE_URL      -- PostgreSQL connection string
 *   JWT_PUBLIC_KEY    -- RSA PEM public key for Bearer token verification
 *   JWT_PRIVATE_KEY   -- RSA PEM private key for JWT issuance
 *   PORT              -- HTTP port (default: 8080)
 */

import express, { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { getPool } from './db';
import { runMigrations } from './migrate';
import { createProductRouter } from './routes/product.routes';
import { createSaleRouter } from './routes/sale.routes';
import { createCustomerRouter, createCustomerV1Router } from './routes/customer.routes';
import { createHistoryRouter } from './routes/history.routes';
import { createReturnsRouter } from './routes/returns.routes';
import { createCashRouter } from './routes/cash.routes';
import { createReportsRouter } from './routes/reports.routes';
import { createSearchRouter } from './routes/search.routes';
import { buildAuthRouter } from './routes/auth.routes';
import { buildUsersRouter } from './routes/users.routes';
import { buildSupplierRouter } from './routes/supplier.routes';
import { buildExpenseRouter } from './routes/expense.routes';
import { buildBranchRouter } from './routes/branch.routes';
import { buildSyncRouter } from './routes/sync.routes';
import { buildRepairRouter } from './routes/repair.routes';
import { BranchRepo } from './repositories/branch.repo';
import {
  listBrands,
  DEFAULT_BRANDS,
  listCategories,
  listCompanies,
  listQualities,
  listColors,
  listUnits,
  createCategory,
  createBrand,
  createCompany,
  createQuality,
  createColor,
  createUnit,
  updateCategory,
  updateBrand,
  updateCompany,
  updateQuality,
  updateColor,
  updateUnit,
  getStockMapForBranch,
  adjustStock,
} from './repositories/product.repo';
import { transferStock, StockTransferRepoError } from './repositories/stock_transfer.repo';
import { authMiddleware, isAdmin, RequestIdentity } from './auth';

function loadEnv(): void {
  const envPaths = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), 'env'),
    path.join(process.cwd(), 'backend', 'env'),
    path.join(process.cwd(), '..', '.env'),
    path.join(process.cwd(), '..', 'env'),
    path.join(process.cwd(), '..', 'backend', 'env'),
    path.join(__dirname, '..', '.env'),
    path.join(__dirname, '..', 'env'),
    path.join(__dirname, '..', '..', '.env'),
  ];
  for (const p of envPaths) {
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf8');
        for (const line of content.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      } catch {}
    }
  }

  if (!process.env['JWT_PUBLIC_KEY']) {
    const keyPaths = [
      path.join(process.cwd(), 'jwt_pub.pem'),
      path.join(process.cwd(), '..', 'jwt_pub.pem'),
      path.join(__dirname, '..', 'jwt_pub.pem'),
      path.join(__dirname, '..', '..', 'jwt_pub.pem'),
    ];
    for (const kp of keyPaths) {
      if (fs.existsSync(kp)) {
        try {
          process.env['JWT_PUBLIC_KEY'] = fs.readFileSync(kp, 'utf8');
          break;
        } catch {}
      }
    }
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    console.error(`FATAL: Environment variable ${name} is required but missing or empty.`);
    console.error(`Please set ${name} in your environment or place a .env file in the project root.`);
    process.exit(1);
  }
  return value.trim();
}

async function main(): Promise<void> {
  loadEnv();
  requireEnv('DATABASE_URL');
  requireEnv('JWT_PUBLIC_KEY');
  requireEnv('JWT_PRIVATE_KEY');

  const port = parseInt(process.env['PORT'] ?? '8080', 10);

  const app = express();

  // Handle CORS for browser frontend development
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json());

  const pool = getPool();

  // Run PostgreSQL database migrations sequentially on startup
  try {
    await runMigrations(pool);
  } catch (err) {
    console.error('[server] Fatal database migration failure:', (err as Error).message);
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // Auth routes — TypeScript Online Authority
  // -------------------------------------------------------------------------
  const authRouter = buildAuthRouter(pool);
  app.use('/api/auth', authRouter);
  app.use('/api/v1/auth', authRouter);

  // -------------------------------------------------------------------------
  // User management routes — TypeScript Online Authority
  // -------------------------------------------------------------------------
  const usersRouter = buildUsersRouter(pool);
  app.use('/api/users', usersRouter);
  app.use('/api/v1/users', usersRouter);

  // -------------------------------------------------------------------------
  // Supplier routes — TypeScript Online Authority
  // -------------------------------------------------------------------------
  const supplierRouter = buildSupplierRouter(pool);
  app.use('/api/suppliers', supplierRouter);
  app.use('/api/v1/suppliers', supplierRouter);

  // -------------------------------------------------------------------------
  // Expense routes — TypeScript Online Authority
  // -------------------------------------------------------------------------
  const expenseRouter = buildExpenseRouter(pool);
  app.use('/api/expenses', expenseRouter);
  app.use('/api/v1/expenses', expenseRouter);

  // -------------------------------------------------------------------------
  // Branch routes — TypeScript Online Authority
  // -------------------------------------------------------------------------
  const branchRouter = buildBranchRouter(pool);
  app.use('/api/branches', branchRouter);
  app.use('/api/v1/branches', branchRouter);
  app.use('/api/shops', branchRouter);

  // -------------------------------------------------------------------------
  // Sync routes — Desktop offline-first sync push/pull
  // -------------------------------------------------------------------------
  const syncRouter = buildSyncRouter(pool);
  app.use('/api/v1/sync', syncRouter);

  // -------------------------------------------------------------------------
  // Repair job routes — TypeScript Online Authority (P6)
  // -------------------------------------------------------------------------
  const repairRouter = buildRepairRouter(pool);
  app.use('/api/repairs', repairRouter);
  app.use('/api/v1/repairs', repairRouter);

  const productRouter = createProductRouter(pool);
  app.use('/api/products', productRouter);
  app.use('/api/v1/products', productRouter);

  const saleRouter = createSaleRouter(pool);
  app.use('/api/sales', saleRouter);
  app.use('/api/v1/sales', saleRouter);

  const customerRouter = createCustomerRouter(pool);
  app.use('/api/customers', customerRouter);

  const customerV1Router = createCustomerV1Router(pool);
  app.use('/api/v1/customers', customerV1Router);

  const historyRouter = createHistoryRouter(pool);
  app.use('/api/history', historyRouter);
  app.use('/api/v1/history', historyRouter);

  const returnsRouter = createReturnsRouter(pool);
  app.use('/api/returns', returnsRouter);
  app.use('/api/v1/returns', returnsRouter);

  const cashRouter = createCashRouter(pool);
  app.use('/api/cash', cashRouter);
  app.use('/api/v1/cash', cashRouter);

  const reportsRouter = createReportsRouter(pool);
  app.use('/api/reports', reportsRouter);
  app.use('/api/v1/reports', reportsRouter);

  const searchRouter = createSearchRouter(pool);
  app.use('/api/search', searchRouter);
  app.use('/api/v1/search', searchRouter);

  app.get(['/api/organization/balances', '/api/v1/organization/balances'], async (_req: Request, res: Response) => {
    try {
      const branchRepo = new BranchRepo(pool);
      const balances = await branchRepo.getDashboardBalances();
      res.status(200).json(balances);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch dashboard balances' });
    }
  });

  app.get(['/api/brands', '/api/v1/brands'], async (_req: Request, res: Response) => {
    try {
      const brands = await listBrands(pool);
      res.status(200).json(brands);
    } catch {
      res.status(200).json(DEFAULT_BRANDS);
    }
  });

  app.post(['/api/brands', '/api/v1/brands'], async (req: Request, res: Response) => {
    try {
      const name = req.body?.name || req.body?.title;
      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Name is required' });
        return;
      }
      const item = await createBrand(pool, { name, code: req.body?.code, description: req.body?.description });
      res.status(201).json(item);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to create brand' });
    }
  });

  app.put(['/api/brands/:id', '/api/v1/brands/:id'], async (req: Request, res: Response) => {
    try {
      const id = req.params['id'] as string;
      const name = req.body?.name || req.body?.title;
      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Name is required' });
        return;
      }
      const item = await updateBrand(pool, id, { name });
      res.status(200).json(item);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to update brand' });
    }
  });

  app.get(['/api/categories', '/api/v1/categories'], async (_req: Request, res: Response) => {
    const list = await listCategories(pool);
    res.status(200).json(list);
  });

  app.post(['/api/categories', '/api/v1/categories'], async (req: Request, res: Response) => {
    try {
      const name = req.body?.name || req.body?.title;
      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Name is required' });
        return;
      }
      const item = await createCategory(pool, { name, code: req.body?.code, description: req.body?.description });
      res.status(201).json(item);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to create category' });
    }
  });

  app.put(['/api/categories/:id', '/api/v1/categories/:id'], async (req: Request, res: Response) => {
    try {
      const id = req.params['id'] as string;
      const name = req.body?.name || req.body?.title;
      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Name is required' });
        return;
      }
      const item = await updateCategory(pool, id, { name });
      res.status(200).json(item);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to update category' });
    }
  });

  app.get(['/api/companies', '/api/v1/companies'], async (_req: Request, res: Response) => {
    const list = await listCompanies(pool);
    res.status(200).json(list);
  });

  app.post(['/api/companies', '/api/v1/companies'], async (req: Request, res: Response) => {
    try {
      const name = req.body?.name || req.body?.title;
      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Name is required' });
        return;
      }
      const item = await createCompany(pool, { name, code: req.body?.code, description: req.body?.description });
      res.status(201).json(item);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to create company' });
    }
  });

  app.put(['/api/companies/:id', '/api/v1/companies/:id'], async (req: Request, res: Response) => {
    try {
      const id = req.params['id'] as string;
      const name = req.body?.name || req.body?.title;
      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Name is required' });
        return;
      }
      const item = await updateCompany(pool, id, { name });
      res.status(200).json(item);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to update company' });
    }
  });

  app.get(['/api/qualities', '/api/v1/qualities'], async (_req: Request, res: Response) => {
    const list = await listQualities(pool);
    res.status(200).json(list);
  });

  app.post(['/api/qualities', '/api/v1/qualities'], async (req: Request, res: Response) => {
    try {
      const name = req.body?.name || req.body?.title;
      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Name is required' });
        return;
      }
      const item = await createQuality(pool, { name, code: req.body?.code, description: req.body?.description });
      res.status(201).json(item);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to create quality' });
    }
  });

  app.put(['/api/qualities/:id', '/api/v1/qualities/:id'], async (req: Request, res: Response) => {
    try {
      const id = req.params['id'] as string;
      const name = req.body?.name || req.body?.title;
      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Name is required' });
        return;
      }
      const item = await updateQuality(pool, id, { name });
      res.status(200).json(item);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to update quality' });
    }
  });

  app.get(['/api/colors', '/api/v1/colors'], async (_req: Request, res: Response) => {
    const list = await listColors(pool);
    res.status(200).json(list);
  });

  app.post(['/api/colors', '/api/v1/colors'], async (req: Request, res: Response) => {
    try {
      const name = req.body?.name || req.body?.title;
      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Name is required' });
        return;
      }
      const item = await createColor(pool, { name, code: req.body?.code, description: req.body?.description });
      res.status(201).json(item);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to create color' });
    }
  });

  app.put(['/api/colors/:id', '/api/v1/colors/:id'], async (req: Request, res: Response) => {
    try {
      const id = req.params['id'] as string;
      const name = req.body?.name || req.body?.title;
      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Name is required' });
        return;
      }
      const item = await updateColor(pool, id, { name });
      res.status(200).json(item);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to update color' });
    }
  });

  app.get(['/api/units', '/api/v1/units'], async (_req: Request, res: Response) => {
    const list = await listUnits(pool);
    res.status(200).json(list);
  });

  app.post(['/api/units', '/api/v1/units'], async (req: Request, res: Response) => {
    try {
      const name = req.body?.name || req.body?.title;
      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Name is required' });
        return;
      }
      const item = await createUnit(pool, { name, symbol: req.body?.symbol || req.body?.code, code: req.body?.code });
      res.status(201).json(item);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to create unit' });
    }
  });

  app.put(['/api/units/:id', '/api/v1/units/:id'], async (req: Request, res: Response) => {
    try {
      const id = req.params['id'] as string;
      const name = req.body?.name || req.body?.title;
      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Name is required' });
        return;
      }
      const item = await updateUnit(pool, id, { name });
      res.status(200).json(item);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to update unit' });
    }
  });

  // ── GET /api/inventory — P2/P7 fix: add authMiddleware, enforce branch scope ──
  app.get(['/api/inventory', '/api/v1/inventory', '/api/stock'], authMiddleware, async (req: Request, res: Response) => {
    try {
      const identity = req.identity as RequestIdentity;
      const callerIsAdmin = isAdmin(identity);

      // P7: Non-admins can only see their own branch's stock.
      // Admins may query any branch or all branches (no branch_id = all branches).
      let branchId: string | undefined;
      if (!callerIsAdmin) {
        // Force to identity branch regardless of query param
        branchId = identity.branch_id ?? undefined;
      } else {
        // Admin: allow explicit branch_id query param, or undefined (all branches)
        branchId = (req.query['branch_id'] as string) || undefined;
      }

      const stockMap = await getStockMapForBranch(pool, branchId);
      res.status(200).json(stockMap);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch inventory' });
    }
  });

  // ── POST /api/inventory/adjust — P2/P3 fix: require auth + admin-only ────────
  app.post(
    ['/api/inventory/adjust', '/api/v1/inventory/adjust', '/api/stock/adjust'],
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const identity = req.identity as RequestIdentity;

        // P3: Only admins may manually adjust stock
        if (!isAdmin(identity)) {
          res.status(403).json({ error: 'Forbidden: stock adjustments require administrator role' });
          return;
        }

        const productId = req.body?.product_id || req.body?.productId;
        if (!productId || typeof productId !== 'string') {
          res.status(400).json({ error: 'product_id is required' });
          return;
        }

        const targetQty = Number(req.body?.target_quantity ?? req.body?.targetQuantity ?? req.body?.quantity ?? 0);
        if (isNaN(targetQty) || targetQty < 0) {
          res.status(400).json({ error: 'target_quantity must be a non-negative number' });
          return;
        }

        // P3: Branch must be explicitly provided; no hardcoded fallback
        const branchId = (req.body?.branch_id || req.body?.branchId) as string | undefined;
        if (!branchId || !branchId.trim()) {
          res.status(400).json({ error: 'branch_id is required for stock adjustment' });
          return;
        }

        const reason = req.body?.reason;
        const referenceId = req.body?.reference_id || req.body?.referenceId;

        const newStock = await adjustStock(pool, {
          product_id: productId,
          branch_id: branchId,
          target_quantity: targetQty,
          reason,
          reference_id: referenceId,
        });
        res.status(200).json({ data: newStock, newStock });
      } catch (err: any) {
        const statusCode = err?.statusCode ?? 500;
        res.status(statusCode).json({ error: err.message || 'Failed to adjust stock' });
      }
    }
  );

  // ── POST /api/v1/inventory/transfer — P4: real stock transfer endpoint ────────
  app.post(
    ['/api/inventory/transfer', '/api/v1/inventory/transfer', '/api/stock/transfer'],
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const identity = req.identity as RequestIdentity;

        // P4: Only admins may transfer stock between branches
        if (!isAdmin(identity)) {
          res.status(403).json({ error: 'Forbidden: stock transfers require administrator role' });
          return;
        }

        const sourceId = (req.body?.source_branch_id || req.body?.sourceBranchId || req.body?.from_branch_id) as string | undefined;
        const destId = (req.body?.destination_branch_id || req.body?.destinationBranchId || req.body?.to_branch_id) as string | undefined;
        const productId = (req.body?.product_id || req.body?.productId) as string | undefined;
        const quantity = Number(req.body?.quantity ?? 0);
        const reason = req.body?.reason as string | undefined;
        const notes = req.body?.notes as string | undefined;

        if (!sourceId || !sourceId.trim()) {
          res.status(400).json({ error: 'source_branch_id is required' });
          return;
        }
        if (!destId || !destId.trim()) {
          res.status(400).json({ error: 'destination_branch_id is required' });
          return;
        }
        if (!productId || !productId.trim()) {
          res.status(400).json({ error: 'product_id is required' });
          return;
        }
        if (!quantity || quantity <= 0 || !Number.isInteger(quantity)) {
          res.status(400).json({ error: 'quantity must be a positive integer' });
          return;
        }

        const result = await transferStock(pool, {
          source_branch_id: sourceId.trim(),
          destination_branch_id: destId.trim(),
          product_id: productId.trim(),
          quantity,
          reason: reason ?? null,
          notes: notes ?? null,
        }, identity.user_id);

        res.status(200).json(result);
      } catch (err: any) {
        if (err instanceof StockTransferRepoError) {
          res.status(err.statusCode).json({ error: err.message });
          return;
        }
        res.status(500).json({ error: err.message || 'Failed to transfer stock' });
      }
    }
  );

  app.get(['/health', '/api/health', '/api/v1/health'], (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', service: 'niazi-product-backend' });
  });

  // Standard API 404 Handler (Rust sidecar reverse proxy fallback retired)
  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Not Found', path: req.originalUrl });
  });

  await new Promise<void>((resolve) => {
    app.listen(port, () => resolve());
  });

  console.log(`[server] Niazi Standalone TypeScript Backend listening on port ${port}`);
}

main().catch((err) => {
  console.error('[server] Fatal startup error:', err);
  process.exit(1);
});

