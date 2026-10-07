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
import {
  listBrands,
  DEFAULT_BRANDS,
  listCategories,
  listCompanies,
  listQualities,
  listColors,
  listUnits,
  getStockMapForBranch,
} from './repositories/product.repo';

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

  app.get(['/api/brands', '/api/v1/brands'], async (_req: Request, res: Response) => {
    try {
      const brands = await listBrands(pool);
      res.status(200).json(brands);
    } catch {
      res.status(200).json(DEFAULT_BRANDS);
    }
  });

  app.get(['/api/categories', '/api/v1/categories'], async (_req: Request, res: Response) => {
    const list = await listCategories(pool);
    res.status(200).json(list);
  });

  app.get(['/api/companies', '/api/v1/companies'], async (_req: Request, res: Response) => {
    const list = await listCompanies(pool);
    res.status(200).json(list);
  });

  app.get(['/api/qualities', '/api/v1/qualities'], async (_req: Request, res: Response) => {
    const list = await listQualities(pool);
    res.status(200).json(list);
  });

  app.get(['/api/colors', '/api/v1/colors'], async (_req: Request, res: Response) => {
    const list = await listColors(pool);
    res.status(200).json(list);
  });

  app.get(['/api/units', '/api/v1/units'], async (_req: Request, res: Response) => {
    const list = await listUnits(pool);
    res.status(200).json(list);
  });

  app.get(['/api/inventory', '/api/v1/inventory', '/api/stock'], async (req: Request, res: Response) => {
    const branchId = req.query['branch_id'] as string | undefined;
    const stockMap = await getStockMapForBranch(pool, branchId);
    res.status(200).json(stockMap);
  });

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

