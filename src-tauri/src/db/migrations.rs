use chrono::Utc;
use rusqlite::Connection;
use tracing::info;

use crate::db::errors::{DbError, DbResult};

/// Represents an immutable database schema migration
pub struct Migration {
    pub version: i32,
    pub name: &'static str,
    pub up: &'static str,
}

/// Registry of permanent database schema migrations for Niazi Mobile Mart
pub const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        name: "001_initial_core_schema",
        up: r#"
        -- Schema migrations tracking table
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL
        );

        -- Permanent single organization table (Niazi Mobile Mart ONLY - no SaaS multi-tenancy)
        CREATE TABLE IF NOT EXISTS organizations (
            id TEXT PRIMARY KEY CHECK(length(id) = 36),
            name TEXT NOT NULL,
            currency TEXT NOT NULL DEFAULT 'PKR',
            currency_symbol TEXT NOT NULL DEFAULT 'Rs',
            minor_unit TEXT NOT NULL DEFAULT 'paisa',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        -- Seed fixed canonical organization for Niazi Mobile Mart
        INSERT OR IGNORE INTO organizations (id, name, currency, currency_symbol, minor_unit, created_at, updated_at)
        VALUES ('00000000-0000-0000-0000-000000000001', 'Niazi Mobile Mart', 'PKR', 'Rs', 'paisa', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

        -- Controlled physical retail branches belonging exclusively to Niazi Mobile Mart
        CREATE TABLE IF NOT EXISTS branches (
            id TEXT PRIMARY KEY CHECK(length(id) = 36),
            organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
            name TEXT NOT NULL,
            code TEXT NOT NULL UNIQUE,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        -- Seed default Main Branch
        INSERT OR IGNORE INTO branches (id, organization_id, name, code, is_active, created_at, updated_at)
        VALUES ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Main Branch', 'MAIN', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

        -- Staff users table with UUID v4 primary keys and optional branch assignment
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY CHECK(length(id) = 36),
            branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
            name TEXT NOT NULL,
            username TEXT NOT NULL COLLATE NOCASE,
            login_key_hash TEXT NOT NULL,
            pin_hash TEXT,
            role TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            failed_pin_attempts INTEGER NOT NULL DEFAULT 0,
            pin_locked_until_ms INTEGER,
            failed_login_attempts INTEGER NOT NULL DEFAULT 0,
            login_locked_until_ms INTEGER,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);
        CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
        CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
        CREATE INDEX IF NOT EXISTS idx_users_branch_id ON users(branch_id);

        -- Staff access profiles and operational limits
        CREATE TABLE IF NOT EXISTS user_access_profiles (
            user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            allowed_pages TEXT NOT NULL,
            allowed_actions TEXT NOT NULL,
            max_discount_percent REAL NOT NULL DEFAULT 5.0,
            can_price_override INTEGER NOT NULL DEFAULT 0,
            can_refund INTEGER NOT NULL DEFAULT 0,
            can_void_sale INTEGER NOT NULL DEFAULT 0,
            can_view_profit INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        -- Publicly published rate catalog for Play Store mobile application
        -- STRICT DATA ISOLATION: NEVER stores cost, supplier, stock counts, or margins
        CREATE TABLE IF NOT EXISTS public_rates (
            product_id TEXT PRIMARY KEY CHECK(length(product_id) = 36),
            product_name TEXT NOT NULL,
            category TEXT NOT NULL,
            selling_rate_paisa INTEGER NOT NULL CHECK(selling_rate_paisa >= 0),
            currency TEXT NOT NULL DEFAULT 'PKR',
            is_public INTEGER NOT NULL DEFAULT 1,
            published_by TEXT REFERENCES users(id),
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_public_rates_is_public ON public_rates(is_public);
        "#,
    },
];

/// Migration engine that executes pending migrations deterministically in a transaction
pub struct MigrationRunner;

impl MigrationRunner {
    /// Executes all unapplied migrations against the given SQLite connection
    pub fn run(conn: &mut Connection) -> DbResult<usize> {
        // Ensure schema_migrations exists first
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                applied_at TEXT NOT NULL
            );",
        )?;

        // Query applied versions and drop statement before running transactions
        let applied_versions: Vec<i32> = {
            let mut stmt = conn.prepare("SELECT version FROM schema_migrations ORDER BY version ASC")?;
            let versions = stmt
                .query_map([], |row| row.get(0))?
                .filter_map(|r| r.ok())
                .collect();
            versions
        };

        let mut applied_count = 0;

        for migration in MIGRATIONS {
            if !applied_versions.contains(&migration.version) {
                info!(
                    "Applying migration {} - {}",
                    migration.version, migration.name
                );

                let tx = conn.transaction()?;

                // Execute migration batch
                tx.execute_batch(migration.up).map_err(|e| {
                    DbError::MigrationError(format!(
                        "Failed migration {} ({}): {e}",
                        migration.version, migration.name
                    ))
                })?;

                // Record applied migration
                let now = Utc::now().to_rfc3339();
                tx.execute(
                    "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?1, ?2, ?3)",
                    rusqlite::params![migration.version, migration.name, now],
                )?;

                tx.commit()?;
                applied_count += 1;
            }
        }

        if applied_count > 0 {
            info!("Successfully executed {applied_count} database migrations");
        }

        Ok(applied_count)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_migration_execution_and_idempotency() {
        let mut conn = Connection::open_in_memory().unwrap();
        // Enable foreign keys
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();

        // 1. First run applies migrations
        let count = MigrationRunner::run(&mut conn).unwrap();
        assert_eq!(count, 1);

        // Verify permanent tables exist
        let tables_count: i64 = conn
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('organizations', 'branches', 'users', 'user_access_profiles', 'public_rates')",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(tables_count, 5);

        // Verify Niazi Mobile Mart organization is locked in
        let org_name: String = conn
            .query_row(
                "SELECT name FROM organizations WHERE id='00000000-0000-0000-0000-000000000001'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(org_name, "Niazi Mobile Mart");

        let org_currency: String = conn
            .query_row(
                "SELECT currency FROM organizations WHERE id='00000000-0000-0000-0000-000000000001'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(org_currency, "PKR");

        // Verify default Main branch exists
        let branch_name: String = conn
            .query_row(
                "SELECT name FROM branches WHERE code='MAIN'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(branch_name, "Main Branch");

        // 2. Second run is idempotent (0 applied)
        let second_run = MigrationRunner::run(&mut conn).unwrap();
        assert_eq!(second_run, 0);
    }
}
