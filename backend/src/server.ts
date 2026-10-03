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

import express, { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { getPool } from './db';
import { createProductRouter } from './routes/product.routes';

function loadEnv(): void {
  const envPaths = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '..', '.env'),
    path.join(__dirname, '..', '.env'),
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
    app.listen(port, () => resolve());
  });

  console.log(`[server] Niazi Product Backend listening on port ${port}`);
}

main().catch((err) => {
  console.error('[server] Fatal startup error:', err);
  process.exit(1);
});
