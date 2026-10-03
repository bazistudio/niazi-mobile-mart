import { Pool } from 'pg';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`FATAL: Environment variable ${name} is required but missing or empty.`);
  }
  return value.trim();
}

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (!_pool) {
    const connectionString = requireEnv('DATABASE_URL');
    _pool = new Pool({ connectionString });

    _pool.on('error', (err) => {
      console.error('[db] Unexpected pool error:', err.message);
    });
  }
  return _pool;
}
