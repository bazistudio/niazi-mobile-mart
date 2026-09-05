import { Database } from 'better-sqlite3';
import { logger } from '../logger';

export function initializeSchema(db: Database) {
  // We use execute because these are DDL statements.
  
  // 1. Core Data Entities
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      updatedAt INTEGER NOT NULL,
      version INTEGER NOT NULL DEFAULT 1
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      stock INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      version INTEGER NOT NULL DEFAULT 1
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      customerId TEXT,
      total REAL NOT NULL,
      status TEXT NOT NULL,
      items TEXT NOT NULL,
      paymentMethod TEXT,
      discount REAL,
      updatedAt INTEGER NOT NULL,
      version INTEGER NOT NULL DEFAULT 1
    );
  `);

  // Simple migrations for existing DBs that were created before these columns were added
  const newColumns = [
    'customerId TEXT',
    'items TEXT',
    'paymentMethod TEXT',
    'discount REAL'
  ];

  for (const col of newColumns) {
    try {
      db.exec(`ALTER TABLE orders ADD COLUMN ${col};`);
    } catch (err) {
      if (!(err instanceof Error) || !err.message.includes('duplicate column name')) {
        logger.warn(`[DB] Migration warn: Could not add ${col} to orders:`, err);
      }
    }
  }

  // 2. Sync Queue (Pending mutations)
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY, -- Same as operation_log ID for tracing
      entity_type TEXT NOT NULL,
      operation TEXT NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE'
      payload TEXT NOT NULL, -- JSON
      timestamp INTEGER NOT NULL
    );
  `);

  // 3. Operation Log (Audit trail)
  db.exec(`
    CREATE TABLE IF NOT EXISTS operation_log (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      status TEXT NOT NULL -- 'pending', 'synced', 'failed'
    );
  `);
  // 4. Audit Log (Security & Tracking)
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      shop_id TEXT,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      metadata TEXT
    );
  `);
}
