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
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        -- Seed fixed canonical organization for Niazi Mobile Mart
        INSERT OR IGNORE INTO organizations (id, name, currency, currency_symbol, created_at, updated_at)
        VALUES ('00000000-0000-0000-0000-000000000001', 'Niazi Mobile Mart', 'PKR', 'Rs', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

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
            selling_rate INTEGER NOT NULL CHECK(selling_rate >= 0),
            currency TEXT NOT NULL DEFAULT 'PKR',
            is_public INTEGER NOT NULL DEFAULT 1,
            published_by TEXT REFERENCES users(id),
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_public_rates_is_public ON public_rates(is_public);
        "#,
    },
    Migration {
        version: 2,
        name: "002_product_and_inventory_schema",
        up: r#"
        -- 1. Categories (Catalog Taxonomy)
        CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY CHECK(length(id) = 36),
            name TEXT NOT NULL,
            code TEXT NOT NULL UNIQUE,
            description TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        -- 2. Brands (Manufacturers / Brands)
        CREATE TABLE IF NOT EXISTS brands (
            id TEXT PRIMARY KEY CHECK(length(id) = 36),
            name TEXT NOT NULL,
            code TEXT NOT NULL UNIQUE,
            description TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        -- 3. Units (Packaging & Stock Units)
        CREATE TABLE IF NOT EXISTS units (
            id TEXT PRIMARY KEY CHECK(length(id) = 36),
            name TEXT NOT NULL,
            symbol TEXT,
            conversion_factor INTEGER NOT NULL DEFAULT 1 CHECK(conversion_factor >= 1),
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        -- 4. Products (Core Retail Catalog Master Data)
        CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY CHECK(length(id) = 36),
            name TEXT NOT NULL,
            sku TEXT NOT NULL UNIQUE,
            barcode TEXT UNIQUE,
            category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
            brand_id TEXT REFERENCES brands(id) ON DELETE SET NULL,
            unit_id TEXT REFERENCES units(id) ON DELETE RESTRICT,
            purchase_price INTEGER NOT NULL CHECK(purchase_price >= 0),
            sale_price INTEGER NOT NULL CHECK(sale_price >= 0),
            low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK(low_stock_threshold >= 0),
            is_active INTEGER NOT NULL DEFAULT 1,
            description TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
        CREATE INDEX IF NOT EXISTS idx_products_brand_id ON products(brand_id);
        CREATE INDEX IF NOT EXISTS idx_products_unit_id ON products(unit_id);
        CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
        CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
        CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);

        -- 5. Branch Stock State (Per-product stock per controlled branch)
        CREATE TABLE IF NOT EXISTS stock (
            product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
            branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
            quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity >= 0),
            updated_at TEXT NOT NULL,
            PRIMARY KEY (product_id, branch_id)
        );

        CREATE INDEX IF NOT EXISTS idx_stock_branch_id ON stock(branch_id);

        -- 6. Stock Movements (Immutable Historical Inventory Ledger)
        CREATE TABLE IF NOT EXISTS stock_movements (
            id TEXT PRIMARY KEY CHECK(length(id) = 36),
            product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
            branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
            movement_type TEXT NOT NULL CHECK(movement_type IN ('IN', 'OUT', 'ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT')),
            quantity INTEGER NOT NULL CHECK(quantity > 0),
            previous_stock INTEGER NOT NULL CHECK(previous_stock >= 0),
            resulting_stock INTEGER NOT NULL CHECK(resulting_stock >= 0),
            reason TEXT,
            performed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
            reference_id TEXT,
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
        CREATE INDEX IF NOT EXISTS idx_stock_movements_branch ON stock_movements(branch_id);
        CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements(created_at);
        "#,
    },
    Migration {
        version: 3,
        name: "003_auth_security_fields",
        up: r#"
        ALTER TABLE users ADD COLUMN recovery_key_hash TEXT;
        ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;
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
        assert_eq!(count, 3);

        // Verify permanent tables exist (5 from Phase 6 + 6 from Phase 7 = 11 tables)
        let tables_count: i64 = conn
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN (
                    'organizations', 'branches', 'users', 'user_access_profiles', 'public_rates',
                    'categories', 'brands', 'units', 'products', 'stock', 'stock_movements'
                )",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(tables_count, 11);

        // Verify users table has recovery_key_hash and must_change_password
        let user_cols: Vec<String> = {
            let mut stmt = conn.prepare("PRAGMA table_info(users)").unwrap();
            stmt.query_map([], |row| row.get(1))
                .unwrap()
                .filter_map(|r| r.ok())
                .collect()
        };
        assert!(user_cols.contains(&"recovery_key_hash".to_string()));
        assert!(user_cols.contains(&"must_change_password".to_string()));

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

        let org_symbol: String = conn
            .query_row(
                "SELECT currency_symbol FROM organizations WHERE id='00000000-0000-0000-0000-000000000001'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(org_symbol, "Rs");

        // Verify minor_unit column does NOT exist in organizations
        let has_minor_unit: bool = {
            let mut stmt = conn.prepare("PRAGMA table_info(organizations)").unwrap();
            let cols = stmt
                .query_map([], |row| row.get::<_, String>(1))
                .unwrap()
                .filter_map(|r| r.ok())
                .collect::<Vec<_>>();
            cols.contains(&"minor_unit".to_string())
        };
        assert!(!has_minor_unit, "minor_unit column must NOT exist in organizations table");

        // Verify default Main branch exists
        let branch_name: String = conn
            .query_row(
                "SELECT name FROM branches WHERE code='MAIN'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(branch_name, "Main Branch");

        // Verify public_rates stores integer PKR rupees (1 stored integer = 1 PKR)
        conn.execute(
            "INSERT INTO public_rates (product_id, product_name, category, selling_rate, currency, is_public, updated_at)
             VALUES ('11111111-1111-1111-1111-111111111111', 'Samsung S24 Ultra', 'Smartphones', 380000, 'PKR', 1, '2026-01-01T00:00:00Z')",
            [],
        ).unwrap();

        let stored_rate: i64 = conn.query_row(
            "SELECT selling_rate FROM public_rates WHERE product_id='11111111-1111-1111-1111-111111111111'",
            [],
            |r| r.get(0),
        ).unwrap();
        assert_eq!(stored_rate, 380000, "1 stored integer = 1 PKR rupee (380000 == Rs 380,000)");

        // Verify Phase 7 Product Catalog & Inventory tables work with constraints
        conn.execute(
            "INSERT INTO categories (id, name, code, description, is_active, created_at, updated_at)
             VALUES ('22222222-2222-2222-2222-222222222222', 'Smartphones', 'CAT-SMARTPHONE', 'Mobile Phones', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        ).unwrap();

        conn.execute(
            "INSERT INTO brands (id, name, code, description, is_active, created_at, updated_at)
             VALUES ('33333333-3333-3333-3333-333333333333', 'Samsung', 'BRD-SAMSUNG', 'Samsung Electronics', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        ).unwrap();

        conn.execute(
            "INSERT INTO units (id, name, symbol, conversion_factor, is_active, created_at, updated_at)
             VALUES ('44444444-4444-4444-4444-444444444444', 'Piece', 'pcs', 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        ).unwrap();

        conn.execute(
            "INSERT INTO products (id, name, sku, barcode, category_id, brand_id, unit_id, purchase_price, sale_price, low_stock_threshold, is_active, description, created_at, updated_at)
             VALUES ('55555555-5555-5555-5555-555555555555', 'Samsung Galaxy S24 Ultra', 'SKU-S24-ULTRA', '8806091234567',
                     '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444',
                     320000, 380000, 5, 1, 'Flagship Smartphone', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        ).unwrap();

        // Verify Branch Stock row
        conn.execute(
            "INSERT INTO stock (product_id, branch_id, quantity, updated_at)
             VALUES ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000002', 10, '2026-01-01T00:00:00Z')",
            [],
        ).unwrap();

        // Verify Stock Movement record
        conn.execute(
            "INSERT INTO stock_movements (id, product_id, branch_id, movement_type, quantity, previous_stock, resulting_stock, reason, performed_by, reference_id, created_at)
             VALUES ('66666666-6666-6666-6666-666666666666', '55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000002',
                     'IN', 10, 0, 10, 'Opening Stock', NULL, 'OPENING', '2026-01-01T00:00:00Z')",
            [],
        ).unwrap();

        // 2. Second run is idempotent (0 applied)
        let second_run = MigrationRunner::run(&mut conn).unwrap();
        assert_eq!(second_run, 0);
    }
}
