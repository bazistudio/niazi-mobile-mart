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
import http from 'http';
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
import { createSettingsRouter } from './routes/settings.routes';
import { buildRolesRouter } from './routes/roles.routes'; // DEF-08
import { buildMobileRouter } from './routes/mobile.routes';
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
  deltaStock,
  getStockMovements,
  getLowStockItems,
  receiveStock,
  ReceiveStockDto,
} from './repositories/product.repo';
import { transferStock, transferStockBatch, StockTransferRepoError } from './repositories/stock_transfer.repo';
import { authMiddleware, buildAuthMiddleware, buildActiveUserMiddleware, isAdmin, isOrgAdmin, isBranchAdmin, canAccessBranch, RequestIdentity, CENTRAL_WAREHOUSE_ID } from './auth';
import { writeChangeLogEntry } from './repositories/change_log.repo';
import { initWsServer } from './ws/wsServer';
import { startPgListener } from './ws/pgListener';

// --- (Main server function continues) ---

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

  // NOTE: Active-account enforcement is now integrated into buildAuthMiddleware(pool),
  // which is used by each router via router.use(buildAuthMiddleware(pool)).
  // The former global app.use(buildActiveUserMiddleware(pool)) was ineffective because
  // it ran before req.identity was set by per-router authMiddleware.
  // Do NOT restore a global active-user middleware here.

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

  const settingsRouter = createSettingsRouter(pool);
  app.use('/api/settings', settingsRouter);
  app.use('/api/v1/settings', settingsRouter);

  // Roles management routes — DEF-08: backend-persisted custom roles
  const rolesRouter = buildRolesRouter(pool);
  app.use('/api/roles', rolesRouter);
  app.use('/api/v1/roles', rolesRouter);

  // -------------------------------------------------------------------------
  // Mobile Inventory routes — TypeScript Online Authority
  // -------------------------------------------------------------------------
  const mobileRouter = buildMobileRouter(pool);
  app.use('/api/mobiles', mobileRouter);
  app.use('/api/v1/mobiles', mobileRouter);

  // DEF-SALE-10: Protect org balances endpoint — was unauthenticated, exposed to any caller.
  // Now requires a valid JWT and organization-admin role.
  app.get(
    ['/api/organization/balances', '/api/v1/organization/balances'],
    buildAuthMiddleware(pool),
    async (req: Request, res: Response) => {
      const identity = req.identity as RequestIdentity;
      if (!isOrgAdmin(identity)) {
        res.status(403).json({ error: 'Access denied: Organization balances require organization administrator role' });
        return;
      }
      try {
        const branchRepo = new BranchRepo(pool);
        const balances = await branchRepo.getDashboardBalances();
        res.status(200).json(balances);
      } catch (err: any) {
        res.status(500).json({ error: err.message || 'Failed to fetch dashboard balances' });
      }
    }
  );

  app.get(['/api/brands', '/api/v1/brands'], async (_req: Request, res: Response) => {
    try {
      const brands = await listBrands(pool);
      res.status(200).json(brands);
    } catch {
      res.status(200).json(DEFAULT_BRANDS);
    }
  });

  app.post(['/api/brands', '/api/v1/brands'], authMiddleware, async (req: Request, res: Response) => {
    try {
      const identity = req.identity as RequestIdentity;
      if (!isOrgAdmin(identity)) {
        res.status(403).json({ error: 'Access denied: Only organization administrators may manage brands' });
        return;
      }
      const name = req.body?.name || req.body?.title;
      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Name is required' });
        return;
      }
      const item = await createBrand(pool, { name, code: req.body?.code, description: req.body?.description });
      res.status(201).json(item);
      setImmediate(() => {
        const orgId = identity.organization_id || '00000000-0000-0000-0000-000000000001';
        pool.connect().then(cl => {
          cl.query('BEGIN')
            .then(() => writeChangeLogEntry(cl, {
              organizationId: orgId,
              branchId: identity.branch_id || '00000000-0000-0000-0000-000000000002',
              eventType: 'BRAND_UPDATED',
              entityType: 'brand',
              entityId: item.id,
              payloadStr: JSON.stringify(item),
            }))
            .then(() => cl.query('COMMIT'))
            .catch(() => cl.query('ROLLBACK').catch(() => {}))
            .finally(() => cl.release());
        }).catch(() => {});
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to create brand' });
    }
  });

  app.put(['/api/brands/:id', '/api/v1/brands/:id'], authMiddleware, async (req: Request, res: Response) => {
    try {
      const identity = req.identity as RequestIdentity;
      if (!isOrgAdmin(identity)) {
        res.status(403).json({ error: 'Access denied: Only organization administrators may manage brands' });
        return;
      }
      const id = req.params['id'] as string;
      const name = req.body?.name || req.body?.title;
      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Name is required' });
        return;
      }
      const item = await updateBrand(pool, id, { name });
      res.status(200).json(item);
      setImmediate(() => {
        const orgId = identity.organization_id || '00000000-0000-0000-0000-000000000001';
        pool.connect().then(cl => {
          cl.query('BEGIN')
            .then(() => writeChangeLogEntry(cl, {
              organizationId: orgId,
              branchId: identity.branch_id || '00000000-0000-0000-0000-000000000002',
              eventType: 'BRAND_UPDATED',
              entityType: 'brand',
              entityId: id,
              payloadStr: JSON.stringify(item),
            }))
            .then(() => cl.query('COMMIT'))
            .catch(() => cl.query('ROLLBACK').catch(() => {}))
            .finally(() => cl.release());
        }).catch(() => {});
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to update brand' });
    }
  });

  app.get(['/api/categories', '/api/v1/categories'], async (_req: Request, res: Response) => {
    const list = await listCategories(pool);
    res.status(200).json(list);
  });

  app.post(['/api/categories', '/api/v1/categories'], authMiddleware, async (req: Request, res: Response) => {
    try {
      const identity = req.identity as RequestIdentity;
      if (!isOrgAdmin(identity)) {
        res.status(403).json({ error: 'Access denied: Only organization administrators may manage categories' });
        return;
      }
      const name = req.body?.name || req.body?.title;
      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Name is required' });
        return;
      }
      const item = await createCategory(pool, { name, code: req.body?.code, description: req.body?.description });
      res.status(201).json(item);
      setImmediate(() => {
        const orgId = identity.organization_id || '00000000-0000-0000-0000-000000000001';
        pool.connect().then(cl => {
          cl.query('BEGIN')
            .then(() => writeChangeLogEntry(cl, {
              organizationId: orgId,
              branchId: identity.branch_id || '00000000-0000-0000-0000-000000000002',
              eventType: 'CATEGORY_UPDATED',
              entityType: 'category',
              entityId: item.id,
              payloadStr: JSON.stringify(item),
            }))
            .then(() => cl.query('COMMIT'))
            .catch(() => cl.query('ROLLBACK').catch(() => {}))
            .finally(() => cl.release());
        }).catch(() => {});
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to create category' });
    }
  });

  app.put(['/api/categories/:id', '/api/v1/categories/:id'], authMiddleware, async (req: Request, res: Response) => {
    try {
      const identity = req.identity as RequestIdentity;
      if (!isOrgAdmin(identity)) {
        res.status(403).json({ error: 'Access denied: Only organization administrators may manage categories' });
        return;
      }
      const id = req.params['id'] as string;
      const name = req.body?.name || req.body?.title;
      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Name is required' });
        return;
      }
      const item = await updateCategory(pool, id, { name });
      res.status(200).json(item);
      setImmediate(() => {
        const orgId = identity.organization_id || '00000000-0000-0000-0000-000000000001';
        pool.connect().then(cl => {
          cl.query('BEGIN')
            .then(() => writeChangeLogEntry(cl, {
              organizationId: orgId,
              branchId: identity.branch_id || '00000000-0000-0000-0000-000000000002',
              eventType: 'CATEGORY_UPDATED',
              entityType: 'category',
              entityId: id,
              payloadStr: JSON.stringify(item),
            }))
            .then(() => cl.query('COMMIT'))
            .catch(() => cl.query('ROLLBACK').catch(() => {}))
            .finally(() => cl.release());
        }).catch(() => {});
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to update category' });
    }
  });

  app.get(['/api/companies', '/api/v1/companies'], async (_req: Request, res: Response) => {
    const list = await listCompanies(pool);
    res.status(200).json(list);
  });

  app.post(['/api/companies', '/api/v1/companies'], authMiddleware, async (req: Request, res: Response) => {
    try {
      const identity = req.identity as RequestIdentity;
      if (!isOrgAdmin(identity)) {
        res.status(403).json({ error: 'Access denied: Only organization administrators may manage companies' });
        return;
      }
      const name = req.body?.name || req.body?.title;
      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Name is required' });
        return;
      }
      const item = await createCompany(pool, { name, code: req.body?.code, description: req.body?.description });
      res.status(201).json(item);
      setImmediate(() => {
        const orgId = identity.organization_id || '00000000-0000-0000-0000-000000000001';
        pool.connect().then(cl => {
          cl.query('BEGIN')
            .then(() => writeChangeLogEntry(cl, {
              organizationId: orgId,
              branchId: identity.branch_id || '00000000-0000-0000-0000-000000000002',
              eventType: 'COMPANY_UPDATED',
              entityType: 'company',
              entityId: item.id,
              payloadStr: JSON.stringify(item),
            }))
            .then(() => cl.query('COMMIT'))
            .catch(() => cl.query('ROLLBACK').catch(() => {}))
            .finally(() => cl.release());
        }).catch(() => {});
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to create company' });
    }
  });

  app.put(['/api/companies/:id', '/api/v1/companies/:id'], authMiddleware, async (req: Request, res: Response) => {
    try {
      const identity = req.identity as RequestIdentity;
      if (!isOrgAdmin(identity)) {
        res.status(403).json({ error: 'Access denied: Only organization administrators may manage companies' });
        return;
      }
      const id = req.params['id'] as string;
      const name = req.body?.name || req.body?.title;
      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Name is required' });
        return;
      }
      const item = await updateCompany(pool, id, { name });
      res.status(200).json(item);
      setImmediate(() => {
        const orgId = identity.organization_id || '00000000-0000-0000-0000-000000000001';
        pool.connect().then(cl => {
          cl.query('BEGIN')
            .then(() => writeChangeLogEntry(cl, {
              organizationId: orgId,
              branchId: identity.branch_id || '00000000-0000-0000-0000-000000000002',
              eventType: 'COMPANY_UPDATED',
              entityType: 'company',
              entityId: id,
              payloadStr: JSON.stringify(item),
            }))
            .then(() => cl.query('COMMIT'))
            .catch(() => cl.query('ROLLBACK').catch(() => {}))
            .finally(() => cl.release());
        }).catch(() => {});
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to update company' });
    }
  });

  app.get(['/api/qualities', '/api/v1/qualities'], async (_req: Request, res: Response) => {
    const list = await listQualities(pool);
    res.status(200).json(list);
  });

  app.post(['/api/qualities', '/api/v1/qualities'], authMiddleware, async (req: Request, res: Response) => {
    try {
      const identity = req.identity as RequestIdentity;
      if (!isOrgAdmin(identity)) {
        res.status(403).json({ error: 'Access denied: Only organization administrators may manage qualities' });
        return;
      }
      const name = req.body?.name || req.body?.title;
      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Name is required' });
        return;
      }
      const item = await createQuality(pool, { name, code: req.body?.code, description: req.body?.description });
      res.status(201).json(item);
      setImmediate(() => {
        const orgId = identity.organization_id || '00000000-0000-0000-0000-000000000001';
        pool.connect().then(cl => {
          cl.query('BEGIN')
            .then(() => writeChangeLogEntry(cl, {
              organizationId: orgId,
              branchId: identity.branch_id || '00000000-0000-0000-0000-000000000002',
              eventType: 'QUALITY_UPDATED',
              entityType: 'quality',
              entityId: item.id,
              payloadStr: JSON.stringify(item),
            }))
            .then(() => cl.query('COMMIT'))
            .catch(() => cl.query('ROLLBACK').catch(() => {}))
            .finally(() => cl.release());
        }).catch(() => {});
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to create quality' });
    }
  });

  app.put(['/api/qualities/:id', '/api/v1/qualities/:id'], authMiddleware, async (req: Request, res: Response) => {
    try {
      const identity = req.identity as RequestIdentity;
      if (!isOrgAdmin(identity)) {
        res.status(403).json({ error: 'Access denied: Only organization administrators may manage qualities' });
        return;
      }
      const id = req.params['id'] as string;
      const name = req.body?.name || req.body?.title;
      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Name is required' });
        return;
      }
      const item = await updateQuality(pool, id, { name });
      res.status(200).json(item);
      setImmediate(() => {
        const orgId = identity.organization_id || '00000000-0000-0000-0000-000000000001';
        pool.connect().then(cl => {
          cl.query('BEGIN')
            .then(() => writeChangeLogEntry(cl, {
              organizationId: orgId,
              branchId: identity.branch_id || '00000000-0000-0000-0000-000000000002',
              eventType: 'QUALITY_UPDATED',
              entityType: 'quality',
              entityId: id,
              payloadStr: JSON.stringify(item),
            }))
            .then(() => cl.query('COMMIT'))
            .catch(() => cl.query('ROLLBACK').catch(() => {}))
            .finally(() => cl.release());
        }).catch(() => {});
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to update quality' });
    }
  });

  app.get(['/api/colors', '/api/v1/colors'], async (_req: Request, res: Response) => {
    const list = await listColors(pool);
    res.status(200).json(list);
  });

  app.post(['/api/colors', '/api/v1/colors'], authMiddleware, async (req: Request, res: Response) => {
    try {
      const identity = req.identity as RequestIdentity;
      if (!isOrgAdmin(identity)) {
        res.status(403).json({ error: 'Access denied: Only organization administrators may manage colors' });
        return;
      }
      const name = req.body?.name || req.body?.title;
      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Name is required' });
        return;
      }
      const item = await createColor(pool, { name, code: req.body?.code, description: req.body?.description });
      res.status(201).json(item);
      setImmediate(() => {
        const orgId = identity.organization_id || '00000000-0000-0000-0000-000000000001';
        pool.connect().then(cl => {
          cl.query('BEGIN')
            .then(() => writeChangeLogEntry(cl, {
              organizationId: orgId,
              branchId: identity.branch_id || '00000000-0000-0000-0000-000000000002',
              eventType: 'COLOR_UPDATED',
              entityType: 'color',
              entityId: item.id,
              payloadStr: JSON.stringify(item),
            }))
            .then(() => cl.query('COMMIT'))
            .catch(() => cl.query('ROLLBACK').catch(() => {}))
            .finally(() => cl.release());
        }).catch(() => {});
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to create color' });
    }
  });

  app.put(['/api/colors/:id', '/api/v1/colors/:id'], authMiddleware, async (req: Request, res: Response) => {
    try {
      const identity = req.identity as RequestIdentity;
      if (!isOrgAdmin(identity)) {
        res.status(403).json({ error: 'Access denied: Only organization administrators may manage colors' });
        return;
      }
      const id = req.params['id'] as string;
      const name = req.body?.name || req.body?.title;
      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Name is required' });
        return;
      }
      const item = await updateColor(pool, id, { name });
      res.status(200).json(item);
      setImmediate(() => {
        const orgId = identity.organization_id || '00000000-0000-0000-0000-000000000001';
        pool.connect().then(cl => {
          cl.query('BEGIN')
            .then(() => writeChangeLogEntry(cl, {
              organizationId: orgId,
              branchId: identity.branch_id || '00000000-0000-0000-0000-000000000002',
              eventType: 'COLOR_UPDATED',
              entityType: 'color',
              entityId: id,
              payloadStr: JSON.stringify(item),
            }))
            .then(() => cl.query('COMMIT'))
            .catch(() => cl.query('ROLLBACK').catch(() => {}))
            .finally(() => cl.release());
        }).catch(() => {});
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to update color' });
    }
  });

  app.get(['/api/units', '/api/v1/units'], async (_req: Request, res: Response) => {
    const list = await listUnits(pool);
    res.status(200).json(list);
  });

  app.post(['/api/units', '/api/v1/units'], authMiddleware, async (req: Request, res: Response) => {
    try {
      const identity = req.identity as RequestIdentity;
      if (!isOrgAdmin(identity)) {
        res.status(403).json({ error: 'Access denied: Only organization administrators may manage units' });
        return;
      }
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

  app.put(['/api/units/:id', '/api/v1/units/:id'], authMiddleware, async (req: Request, res: Response) => {
    try {
      const identity = req.identity as RequestIdentity;
      if (!isOrgAdmin(identity)) {
        res.status(403).json({ error: 'Access denied: Only organization administrators may manage units' });
        return;
      }
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

  // ── GET /api/inventory — P2/P7/F-12/F-13 fix: add authMiddleware, enforce branch scope ──
  app.get(['/api/inventory', '/api/v1/inventory', '/api/stock'], authMiddleware, async (req: Request, res: Response) => {
    try {
      const identity = req.identity as RequestIdentity;
      const callerIsOrgAdmin = isOrgAdmin(identity);

      // F-12/F-13 Fix: Non-org-admins can ONLY see their assigned branch's stock.
      // Org Admins may query any specific branch or all branches (no branch_id = all branches).
      let branchId: string | undefined;
      if (!callerIsOrgAdmin) {
        if (!identity.branch_id) {
          res.status(403).json({ error: 'Access denied: User has no assigned branch' });
          return;
        }
        branchId = identity.branch_id;
      } else {
        branchId = (req.query['branch_id'] as string) || (req.query['branchId'] as string) || undefined;
      }

      const stockMap = await getStockMapForBranch(pool, branchId);
      res.status(200).json(stockMap);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch inventory' });
    }
  });

  // ── POST /api/inventory/adjust — P2/P3/F-13 fix: require auth + admin-only ────────
  app.post(
    ['/api/inventory/adjust', '/api/v1/inventory/adjust', '/api/stock/adjust'],
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const identity = req.identity as RequestIdentity;

        // P3/F-13: Branch or Org admins may adjust stock within their permitted branch
        if (!isBranchAdmin(identity)) {
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

        const branchId = (req.body?.branch_id || req.body?.branchId) as string | undefined;
        if (!branchId || !branchId.trim()) {
          res.status(400).json({ error: 'branch_id is required for stock adjustment' });
          return;
        }

        if (!canAccessBranch(identity, branchId)) {
          res.status(403).json({ error: 'Access denied: cannot adjust stock for a different branch' });
          return;
        }

        const reason = req.body?.reason;
        const referenceId = req.body?.reference_id || req.body?.referenceId;

        const newStock = await adjustStock(pool, {
          product_id: productId,
          branch_id: branchId.trim(),
          target_quantity: targetQty,
          reason,
          reference_id: referenceId,
        });
        res.status(200).json({ data: newStock, newStock });
      // Write change_log + pg_notify (best-effort, after committed mutation)
      setImmediate(() => {
        const _orgId = identity.organization_id;
        const _branchId = branchId.trim();
        const _entityId = productId;
        if (_orgId && _branchId && _entityId) {
          pool.connect().then(cl => {
            cl.query('BEGIN')
              .then(() => writeChangeLogEntry(cl, {
                organizationId: _orgId,
                branchId: _branchId,
                eventType: 'INVENTORY_OPERATION_RECORDED',
                entityType: 'stock',
                entityId: _entityId,
                payloadStr: JSON.stringify({ product_id: _entityId, branch_id: _branchId }),
              }))
              .then(() => cl.query('COMMIT'))
              .catch(() => cl.query('ROLLBACK').catch(() => {}))
              .finally(() => cl.release());
          }).catch(() => {});
        }
      });
      } catch (err: any) {
        const statusCode = err?.statusCode ?? 500;
        res.status(statusCode).json({ error: err.message || 'Failed to adjust stock' });
      }
    }
  );

  // ── POST /api/v1/inventory/delta — Phase 7: atomic delta (increase/decrease) ──
  app.post(
    ['/api/inventory/delta', '/api/v1/inventory/delta', '/api/stock/delta'],
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const identity = req.identity as RequestIdentity;

        if (!isBranchAdmin(identity)) {
          res.status(403).json({ error: 'Forbidden: stock delta adjustments require administrator role' });
          return;
        }

        const productId = req.body?.product_id || req.body?.productId;
        if (!productId || typeof productId !== 'string') {
          res.status(400).json({ error: 'product_id is required' });
          return;
        }

        const delta = Number(req.body?.delta ?? req.body?.quantity ?? 0);
        if (isNaN(delta) || delta === 0) {
          res.status(400).json({ error: 'delta must be a non-zero number (positive=increase, negative=decrease)' });
          return;
        }

        const branchId = (req.body?.branch_id || req.body?.branchId) as string | undefined;
        if (!branchId || !branchId.trim()) {
          res.status(400).json({ error: 'branch_id is required for stock delta adjustment' });
          return;
        }

        if (!canAccessBranch(identity, branchId)) {
          res.status(403).json({ error: 'Access denied: cannot apply stock delta for a different branch' });
          return;
        }

        const reason = req.body?.reason;
        const referenceId = req.body?.reference_id || req.body?.referenceId;

        const newStock = await deltaStock(pool, {
          product_id: productId,
          branch_id: branchId.trim(),
          delta,
          reason,
          reference_id: referenceId,
        });
        res.status(200).json({ data: newStock, newStock });
      // Write change_log + pg_notify (best-effort, after committed mutation)
      setImmediate(() => {
        const _orgId = identity.organization_id;
        const _branchId = branchId.trim();
        const _entityId = productId;
        if (_orgId && _branchId && _entityId) {
          pool.connect().then(cl => {
            cl.query('BEGIN')
              .then(() => writeChangeLogEntry(cl, {
                organizationId: _orgId,
                branchId: _branchId,
                eventType: 'INVENTORY_OPERATION_RECORDED',
                entityType: 'stock',
                entityId: _entityId,
                payloadStr: JSON.stringify({ product_id: _entityId, branch_id: _branchId }),
              }))
              .then(() => cl.query('COMMIT'))
              .catch(() => cl.query('ROLLBACK').catch(() => {}))
              .finally(() => cl.release());
          }).catch(() => {});
        }
      });
      } catch (err: any) {
        const statusCode = err?.statusCode ?? 500;
        res.status(statusCode).json({ error: err.message || 'Failed to apply stock delta' });
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

        // Stock transfers between branches require Organization Administrator permissions
        if (!isOrgAdmin(identity)) {
          res.status(403).json({ error: 'Forbidden: cross-branch stock transfers require organization administrator role' });
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

        // Phase 13 Fix: Both source and destination branches must be authorized for the caller.
        // The Central Warehouse (CENTRAL_WAREHOUSE_ID) is a valid source or destination:
        //   - Warehouse → Branch: dispatching stock to a retail branch (org-admin only)
        //   - Branch → Warehouse: returning stock to the warehouse (org-admin only)
        // Since this entire endpoint is org-admin-gated above, canAccessBranch will pass
        // for both warehouse and retail branch IDs for any valid org-admin identity.
        if (!canAccessBranch(identity, sourceId)) {
          res.status(403).json({ error: 'Access denied: cannot transfer stock from a branch you do not manage' });
          return;
        }

        if (!canAccessBranch(identity, destId)) {
          res.status(403).json({ error: 'Access denied: cannot transfer stock to a branch you do not manage' });
          return;
        }

        // Audit log: warehouse movements are significant inventory events
        if (sourceId.trim() === CENTRAL_WAREHOUSE_ID || destId.trim() === CENTRAL_WAREHOUSE_ID) {
          console.log(`[inventory/transfer] Warehouse movement: ${sourceId.trim()} → ${destId.trim()}, product=${productId?.trim()}, qty=${quantity}, by=${identity.user_id}`);
        }

        const result = await transferStock(pool, {
          transfer_id: ((req.body?.transfer_id || req.body?.transferId || req.body?.idempotency_key) as string | undefined)?.trim() || null,
          source_branch_id: sourceId.trim(),
          destination_branch_id: destId.trim(),
          product_id: productId.trim(),
          quantity,
          reason: reason ?? null,
          notes: notes ?? null,
        }, identity.user_id);

        res.status(200).json(result);
      // Write change_log + pg_notify (best-effort, after committed transfer)
      setImmediate(() => {
        const _orgId = identity.organization_id;
        // Cross-branch transfer: notify org-wide (null branchId) so all branch subscribers can refresh
        if (_orgId && result.product_id) {
          const srcB = result.source_branch_id;
          pool.connect().then(cl => {
            cl.query('BEGIN')
              .then(() => writeChangeLogEntry(cl, {
                organizationId: _orgId,
                branchId: srcB,
                eventType: 'STOCK_TRANSFER_COMPLETED',
                entityType: 'stock_transfer',
                entityId: result.transfer_id,
                payloadStr: JSON.stringify({
                  transfer_id: result.transfer_id,
                  product_id: result.product_id,
                  source_branch_id: result.source_branch_id,
                  destination_branch_id: result.destination_branch_id,
                }),
              }))
              .then(() => cl.query('COMMIT'))
              .catch(() => cl.query('ROLLBACK').catch(() => {}))
              .finally(() => cl.release());
          }).catch(() => {});
        }
      });
      } catch (err: any) {
        if (err instanceof StockTransferRepoError) {
          res.status(err.statusCode).json({ error: err.message });
          return;
        }
        res.status(500).json({ error: err.message || 'Failed to transfer stock' });
      }
    }
  );

  // ── POST /api/v1/inventory/transfer/batch — Atomic multi-product stock transfer ────────
  app.post(
    ['/api/inventory/transfer/batch', '/api/v1/inventory/transfer/batch', '/api/stock/transfer/batch'],
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const identity = req.identity as RequestIdentity;

        // Stock transfers require Organization Administrator permissions
        if (!isOrgAdmin(identity)) {
          res.status(403).json({ error: 'Forbidden: cross-branch stock transfers require organization administrator role' });
          return;
        }

        const sourceId = (req.body?.source_branch_id || req.body?.sourceBranchId || req.body?.from_branch_id) as string | undefined;
        const destId = (req.body?.destination_branch_id || req.body?.destinationBranchId || req.body?.to_branch_id) as string | undefined;
        const items = req.body?.items as Array<{ product_id?: string; productId?: string; quantity: number }> | undefined;
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
        if (!items || !Array.isArray(items) || items.length === 0) {
          res.status(400).json({ error: 'items array with at least one product is required' });
          return;
        }

        // Phase 13 Fix: Both source and destination branches must be authorized for caller
        if (!canAccessBranch(identity, sourceId)) {
          res.status(403).json({ error: 'Access denied: cannot transfer stock from a branch you do not manage' });
          return;
        }

        if (!canAccessBranch(identity, destId)) {
          res.status(403).json({ error: 'Access denied: cannot transfer stock to a branch you do not manage' });
          return;
        }

        // Audit log: warehouse movements are significant inventory events
        if (sourceId.trim() === CENTRAL_WAREHOUSE_ID || destId.trim() === CENTRAL_WAREHOUSE_ID) {
          console.log(`[inventory/transfer/batch] Warehouse batch movement: ${sourceId.trim()} → ${destId.trim()}, items=${items.length}, by=${identity.user_id}`);
        }

        const result = await transferStockBatch(pool, {
          transfer_id: ((req.body?.transfer_id || req.body?.transferId || req.body?.idempotency_key) as string | undefined)?.trim() || null,
          source_branch_id: sourceId.trim(),
          destination_branch_id: destId.trim(),
          items: items.map((i) => ({
            product_id: String(i.product_id || i.productId || '').trim(),
            quantity: Number(i.quantity ?? 0),
          })),
          reason: reason ?? null,
          notes: notes ?? null,
        }, identity.user_id);

        res.status(200).json(result);
        // Write change_log + pg_notify (best-effort, after committed batch transfer)
        setImmediate(() => {
          const _orgId = identity.organization_id;
          const srcBranch = result.source_branch_id;
          const dstBranch = result.destination_branch_id;
          if (_orgId && srcBranch && dstBranch) {
            const batchId = result.batch_id;
            const notifyBranch = (branchId: string) =>
              pool.connect().then(cl => {
                cl.query('BEGIN')
                  .then(() => writeChangeLogEntry(cl, {
                    organizationId: _orgId,
                    branchId,
                    eventType: 'STOCK_TRANSFER_COMPLETED',
                    entityType: 'stock_transfer_batch',
                    entityId: batchId,
                    payloadStr: JSON.stringify({
                      batch_id: batchId,
                      source_branch_id: srcBranch,
                      destination_branch_id: dstBranch,
                    }),
                  }))
                  .then(() => cl.query('COMMIT'))
                  .catch(() => cl.query('ROLLBACK').catch(() => {}))
                  .finally(() => cl.release());
              }).catch(() => {});
            notifyBranch(srcBranch);
            if (dstBranch !== srcBranch) notifyBranch(dstBranch);
          }
        });
      } catch (err: any) {
        if (err instanceof StockTransferRepoError) {
          res.status(err.statusCode).json({ error: err.message });
          return;
        }
        res.status(500).json({ error: err.message || 'Failed to process batch stock transfer' });
      }
    }
  );


  // ── POST /api/v1/inventory/receive — Phase 1 WAC Engine / RESTOCK-01 ──────
  // Accepts stock received from a supplier at a unit_cost, recalculates
  // products.average_cost using the Weighted Average Cost (WAC) formula,
  // and increments the branch stock. Requires Branch/Org Admin.
  app.post(
    ['/api/inventory/receive', '/api/v1/inventory/receive', '/api/stock/receive'],
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const identity = req.identity as RequestIdentity;

        if (!isBranchAdmin(identity)) {
          res.status(403).json({ error: 'Forbidden: stock receiving requires administrator role' });
          return;
        }

        const productId    = (req.body?.product_id  || req.body?.productId)  as string | undefined;
        const qtyReceived  = Number(req.body?.quantity_received ?? req.body?.quantityReceived ?? 0);
        const unitCost     = Number(req.body?.unit_cost         ?? req.body?.unitCost         ?? 0);
        const newSalePriceRaw = req.body?.new_sale_price ?? req.body?.newSalePrice;
        const newSalePrice = newSalePriceRaw !== undefined && newSalePriceRaw !== null
          ? Number(newSalePriceRaw)
          : null;
        const supplierId   = (req.body?.supplier_id  || req.body?.supplierId  || null) as string | null;
        const notes        = (req.body?.notes || null) as string | null;

        // org-admins may supply an explicit branch_id; when none is supplied the default
        // destination is the Central Warehouse (migration 030_central_warehouse_location.sql).
        // Branch-users are locked to their JWT branch_id and can never receive into the warehouse.
        const branchId: string | undefined = isOrgAdmin(identity)
          ? ((req.body?.branch_id || req.body?.branchId || CENTRAL_WAREHOUSE_ID) as string | undefined)
          : (identity.branch_id as string | undefined);

        if (!productId || !productId.trim()) {
          res.status(400).json({ error: 'product_id is required' }); return;
        }
        if (!branchId || !branchId.trim()) {
          res.status(400).json({ error: 'branch_id is required' }); return;
        }
        if (!canAccessBranch(identity, branchId)) {
          res.status(403).json({ error: 'Access denied: cannot receive stock for a branch you do not manage' }); return;
        }
        if (!Number.isInteger(qtyReceived) || qtyReceived <= 0) {
          res.status(400).json({ error: 'quantity_received must be a positive integer' }); return;
        }
        if (unitCost < 0 || !Number.isFinite(unitCost)) {
          res.status(400).json({ error: 'unit_cost cannot be negative' }); return;
        }
        if (newSalePrice !== null && (newSalePrice < 0 || !Number.isFinite(newSalePrice))) {
          res.status(400).json({ error: 'new_sale_price cannot be negative' }); return;
        }

        const dto: ReceiveStockDto = {
          product_id:        productId.trim(),
          branch_id:         branchId.trim(),
          quantity_received: qtyReceived,
          unit_cost:         Math.round(unitCost),
          new_sale_price:    newSalePrice !== null ? Math.round(newSalePrice) : null,
          supplier_id:       supplierId,
          notes:             notes,
        };

        const result = await receiveStock(pool, dto, identity.user_id ?? null);
        res.status(200).json(result);
        // Write change_log + pg_notify (best-effort, after committed receive)
        setImmediate(() => {
          const _orgId = identity.organization_id;
          const _branchId = dto.branch_id;
          if (_orgId && _branchId && dto.product_id) {
            pool.connect().then(cl => {
              cl.query('BEGIN')
                .then(() => writeChangeLogEntry(cl, {
                  organizationId: _orgId,
                  branchId: _branchId,
                  eventType: 'INVENTORY_OPERATION_RECORDED',
                  entityType: 'stock',
                  entityId: dto.product_id,
                  payloadStr: JSON.stringify({ product_id: dto.product_id, branch_id: _branchId }),
                }))
                .then(() => cl.query('COMMIT'))
                .catch(() => cl.query('ROLLBACK').catch(() => {}))
                .finally(() => cl.release());
            }).catch(() => {});
          }
        });
      } catch (err: any) {
        if (err && typeof err.statusCode === 'number') {
          res.status(err.statusCode).json({ error: err.message }); return;
        }
        res.status(500).json({ error: err?.message || 'Failed to receive stock' });
      }
    }
  );

  // ── GET /api/v1/inventory/movements — F-08/F-12: stock movement ledger ────────
  app.get(
    ['/api/inventory/movements', '/api/v1/inventory/movements', '/api/stock/movements'],
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const identity = req.identity as RequestIdentity;
        const productId = (req.query['product_id'] as string | undefined) || null;
        const requestedBranch = (req.query['branch_id'] as string | undefined) || null;
        const limit = req.query['limit'] ? Number(req.query['limit']) : null;

        let effectiveBranchId: string | null = null;
        if (isOrgAdmin(identity)) {
          effectiveBranchId = requestedBranch;
        } else {
          if (!identity.branch_id) {
            res.status(403).json({ error: 'Access denied: User has no assigned branch' });
            return;
          }
          effectiveBranchId = identity.branch_id;
        }

        const movements = await getStockMovements(pool, { product_id: productId, branch_id: effectiveBranchId, limit });
        res.status(200).json(movements);
      } catch (err: any) {
        res.status(500).json({ error: err.message || 'Failed to fetch stock movements' });
      }
    }
  );

  // ── GET /api/v1/inventory/low-stock — F-08/F-12: branch low stock ────────────
  app.get(
    ['/api/inventory/low-stock', '/api/v1/inventory/low-stock', '/api/stock/low-stock'],
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const identity = req.identity as RequestIdentity;
        const requestedBranch = (req.query['branch_id'] as string | undefined) || null;

        let effectiveBranchId: string;
        if (isOrgAdmin(identity)) {
          effectiveBranchId = requestedBranch || identity.branch_id || '';
        } else {
          if (!identity.branch_id) {
            res.status(403).json({ error: 'Access denied: User has no assigned branch' });
            return;
          }
          effectiveBranchId = identity.branch_id;
        }

        if (!effectiveBranchId || effectiveBranchId.trim().length < 32) {
          res.status(400).json({ error: 'branch_id is required' });
          return;
        }
        const items = await getLowStockItems(pool, effectiveBranchId.trim());
        res.status(200).json(items);
      } catch (err: any) {
        res.status(500).json({ error: err.message || 'Failed to fetch low stock items' });
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

  const httpServer = http.createServer(app);

  await new Promise<void>((resolve) => {
    httpServer.listen(port, () => resolve());
  });

  console.log(`[server] Niazi Standalone TypeScript Backend listening on port ${port}`);

  // Attach WebSocket server (must be after httpServer.listen)
  initWsServer(httpServer);

  // Start PostgreSQL LISTEN/NOTIFY listener for cross-instance broadcast
  const dbUrl = process.env['DATABASE_URL'];
  if (dbUrl) {
    startPgListener(dbUrl).catch((err) => {
      console.error('[server] Failed to start PG listener:', err);
    });
  } else {
    console.warn('[server] DATABASE_URL not set — real-time WebSocket events disabled');
  }
}

main().catch((err) => {
  console.error('[server] Fatal startup error:', err);
  process.exit(1);
});

