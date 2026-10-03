/**
 * TypeScript Product Backend -- Entry Point
 *
 * Standalone Express server serving the Product domain HTTP routes.
 * All other domains continue to be served by the Rust Axum backend.
 *
 * Routes:
 *   /api/products    -> Product CRUD
 *   /api/v1/products -> Product CRUD (v1 alias, matches Rust Axum registration)
 *
 * Environment variables required:
 *   DATABASE_URL   -- PostgreSQL connection string
 *   JWT_PUBLIC_KEY -- RSA PEM public key for Bearer token verification
 *   PORT           -- HTTP port (default: 8081)
 */

import express, { Request, Response } from 'express';
import { getPool } from './db';
import { createProductRouter } from './routes/product.routes';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    console.error(`FATAL: Environment variable ${name} is required but missing or empty.`);
    process.exit(1);
  }
  return value.trim();
}

async function main(): Promise<void> {
  requireEnv('DATABASE_URL');
  requireEnv('JWT_PUBLIC_KEY');

  const port = parseInt(process.env['PORT'] ?? '8081', 10);

  const app = express();
  app.use(express.json());

  const pool = getPool();

  const productRouter = createProductRouter(pool);
  app.use('/api/products', productRouter);
  app.use('/api/v1/products', productRouter);

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', service: 'niazi-product-backend' });
  });

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  await new Promise<void>((resolve) => {
    app.listen(port, resolve);
  });

  console.log(`[server] Niazi Product Backend listening on port ${port}`);
}

main().catch((err) => {
  console.error('[server] Fatal startup error:', err);
  process.exit(1);
});
