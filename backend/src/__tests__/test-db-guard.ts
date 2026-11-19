/**
 * Niazi Mobile Mart — Isolated Test Environment Safety Guard
 *
 * Enforces strict fail-closed validation on PostgreSQL connection targets for test execution:
 * 1. Requires explicit DATABASE_URL (no fallback to development .env).
 * 2. Parses DATABASE_URL using standard URL parser.
 * 3. Enforces protocol: postgresql: or postgres:
 * 4. Enforces host: strictly 127.0.0.1 (rejects localhost, remote domains, and IP ranges).
 * 5. Enforces port: strictly 5432.
 * 6. Enforces database name: strictly niazi_mobile_mart_test.
 * 7. Enforces non-empty username and password.
 * 8. Explicitly rejects production, Cloud SQL, and development database (niazi_mobile_mart).
 *
 * Throws a fatal Error if any safety constraint is violated.
 */

import fs from 'fs';
import path from 'path';

export interface ValidatedTestDbTarget {
  protocol: string;
  hostname: string;
  port: number;
  database: string;
  username: string;
  sslmode: string;
}

/**
 * Validates that the provided connection string points exclusively to the local
 * isolated test database: 127.0.0.1:5432/niazi_mobile_mart_test.
 */
export function assertSafeTestDatabase(urlStr: string | undefined | null): ValidatedTestDbTarget {
  if (!urlStr || typeof urlStr !== 'string' || !urlStr.trim()) {
    throw new Error('FATAL SAFETY ABORT: DATABASE_URL is missing or empty. An explicit test database target is required.');
  }

  const cleanUrl = urlStr.trim();
  let parsed: URL;

  try {
    parsed = new URL(cleanUrl);
  } catch (err: any) {
    throw new Error(`FATAL SAFETY ABORT: Malformed DATABASE_URL: ${err.message}`);
  }

  // 1. Protocol check
  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'postgresql:' && protocol !== 'postgres:') {
    throw new Error(`FATAL SAFETY ABORT: Invalid database protocol "${protocol}". Must be postgresql: or postgres:.`);
  }

  // 2. Strict loopback hostname check
  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== '127.0.0.1') {
    throw new Error(`FATAL SAFETY ABORT: Tests must target exact loopback IPv4 "127.0.0.1", got: "${hostname}".`);
  }

  // 3. Strict port check
  const port = parsed.port ? parseInt(parsed.port, 10) : 5432;
  if (port !== 5432) {
    throw new Error(`FATAL SAFETY ABORT: Tests must target port 5432, got: ${port}.`);
  }

  // 4. Strict database name check
  const pathname = decodeURIComponent(parsed.pathname.replace(/^\//, '')).trim();
  if (pathname !== 'niazi_mobile_mart_test') {
    throw new Error(
      `FATAL SAFETY ABORT: Target database must be strictly "niazi_mobile_mart_test", got: "${pathname}". Execution aborted to protect development/production data.`
    );
  }

  // 5. Explicit rejection of development database and dangerous keywords
  const DANGEROUS = ['cloud', 'cloudsql', 'prod', 'production', 'live', 'prd'];
  for (const bad of DANGEROUS) {
    if (cleanUrl.toLowerCase().includes(bad)) {
      throw new Error(`FATAL SAFETY ABORT: Connection string contains dangerous pattern "${bad}". Aborting.`);
    }
  }

  // 6. Credentials presence check
  const username = decodeURIComponent(parsed.username || '').trim();
  const password = decodeURIComponent(parsed.password || '').trim();
  if (!username) {
    throw new Error('FATAL SAFETY ABORT: Database username is missing in connection URL.');
  }
  if (!password) {
    throw new Error('FATAL SAFETY ABORT: Database password is missing in connection URL.');
  }

  // 7. Extract sslmode
  const sslmode = (parsed.searchParams.get('sslmode') || 'disable').toLowerCase();

  return {
    protocol,
    hostname,
    port,
    database: pathname,
    username,
    sslmode,
  };
}

/**
 * Loads dedicated test environment from backend/.env.test.local if present,
 * or validates the existing process.env.DATABASE_URL.
 * NEVER loads backend/.env.
 */
export function loadAndEnforceTestEnvironment(rootDir: string = process.cwd()): string {
  // If not already set, attempt to load strictly from .env.test.local
  if (!process.env['DATABASE_URL']) {
    const candidates = [
      path.join(rootDir, '.env.test.local'),
      path.join(rootDir, 'backend', '.env.test.local'),
      path.join(rootDir, '..', '.env.test.local'),
    ];

    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        const lines = fs.readFileSync(cand, 'utf8').split('\n');
        for (const line of lines) {
          const m = line.match(/^([A-Z_]+)\s*=\s*(.+)$/);
          if (m) {
            process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
          }
        }
        break;
      }
    }
  }

  const targetUrl = process.env['DATABASE_URL'];
  assertSafeTestDatabase(targetUrl);
  return targetUrl!;
}
