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
    Migration {
        version: 4,
        name: "004_sales_and_invoices_schema",
        up: r#"
        -- Atomic sequential counter table for collision-safe invoice numbering
        CREATE TABLE IF NOT EXISTS counters (
            name TEXT PRIMARY KEY,
            value INTEGER NOT NULL DEFAULT 0
        );

        INSERT OR IGNORE INTO counters (name, value) VALUES ('invoice', 0);

        -- Sales / Invoice Header Table
        CREATE TABLE IF NOT EXISTS sales (
            id TEXT PRIMARY KEY CHECK(length(id) = 36),
            invoice_number TEXT NOT NULL UNIQUE,
            branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
            customer_id TEXT,
            customer_name_snapshot TEXT,
            subtotal INTEGER NOT NULL CHECK(subtotal >= 0),
            discount INTEGER NOT NULL DEFAULT 0 CHECK(discount >= 0),
            tax_amount INTEGER NOT NULL DEFAULT 0 CHECK(tax_amount >= 0),
            total_amount INTEGER NOT NULL CHECK(total_amount >= 0),
            paid_amount INTEGER NOT NULL CHECK(paid_amount >= 0),
            change_amount INTEGER NOT NULL DEFAULT 0 CHECK(change_amount >= 0),
            payment_status TEXT NOT NULL CHECK(payment_status IN ('PAID', 'PARTIALLY_PAID', 'UNPAID')),
            sale_status TEXT NOT NULL CHECK(sale_status IN ('COMPLETED', 'VOIDED', 'REFUNDED')),
            performed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
            notes TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_invoice_number ON sales(invoice_number);
        CREATE INDEX IF NOT EXISTS idx_sales_branch_id ON sales(branch_id);
        CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
        CREATE INDEX IF NOT EXISTS idx_sales_sale_status ON sales(sale_status);

        -- Sale Line Items (Immutable Historical Snapshot)
        CREATE TABLE IF NOT EXISTS sale_lines (
            id TEXT PRIMARY KEY CHECK(length(id) = 36),
            sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
            product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
            product_name_snapshot TEXT NOT NULL,
            sku_snapshot TEXT NOT NULL,
            unit_price INTEGER NOT NULL CHECK(unit_price >= 0),
            cost_price_snapshot INTEGER NOT NULL DEFAULT 0 CHECK(cost_price_snapshot >= 0),
            quantity INTEGER NOT NULL CHECK(quantity > 0),
            discount INTEGER NOT NULL DEFAULT 0 CHECK(discount >= 0),
            line_total INTEGER NOT NULL CHECK(line_total >= 0),
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_sale_lines_sale_id ON sale_lines(sale_id);
        CREATE INDEX IF NOT EXISTS idx_sale_lines_product_id ON sale_lines(product_id);

        -- Sale Payments (Payment records)
        CREATE TABLE IF NOT EXISTS sale_payments (
            id TEXT PRIMARY KEY CHECK(length(id) = 36),
            sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
            amount INTEGER NOT NULL CHECK(amount > 0),
            payment_method TEXT NOT NULL CHECK(payment_method IN ('CASH', 'CARD', 'BANK_TRANSFER', 'OTHER')),
            reference_number TEXT,
            notes TEXT,
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_sale_payments_sale_id ON sale_payments(sale_id);
        "#,
    },
    Migration {
        version: 5,
        name: "005_customers_and_ledger",
        up: r#"
        -- Counters for sequential customer codes and payment receipts
        INSERT OR IGNORE INTO counters (name, value) VALUES ('customer_code', 0);
        INSERT OR IGNORE INTO counters (name, value) VALUES ('payment_receipt', 0);

        -- Customers master table
        CREATE TABLE IF NOT EXISTS customers (
            id TEXT PRIMARY KEY CHECK(length(id) = 36),
            customer_code TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            alternate_phone TEXT,
            email TEXT,
            address TEXT,
            notes TEXT,
            credit_limit INTEGER NOT NULL DEFAULT 0 CHECK(credit_limit >= 0),
            is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_code ON customers(customer_code);
        CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
        CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name COLLATE NOCASE);
        CREATE INDEX IF NOT EXISTS idx_customers_is_active ON customers(is_active);

        -- Customer Ledger Entries (Append-only Auditable Financial Journal)
        CREATE TABLE IF NOT EXISTS customer_ledger_entries (
            id TEXT PRIMARY KEY CHECK(length(id) = 36),
            customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
            reference_id TEXT,
            reference_number TEXT,
            entry_type TEXT NOT NULL CHECK(entry_type IN ('SALE', 'PAYMENT', 'ADJUSTMENT')),
            debit INTEGER NOT NULL DEFAULT 0 CHECK(debit >= 0),
            credit INTEGER NOT NULL DEFAULT 0 CHECK(credit >= 0),
            balance_after INTEGER NOT NULL CHECK(balance_after >= 0),
            description TEXT NOT NULL,
            performed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_customer_ledger_customer_id ON customer_ledger_entries(customer_id);
        CREATE INDEX IF NOT EXISTS idx_customer_ledger_created_at ON customer_ledger_entries(created_at);
        CREATE INDEX IF NOT EXISTS idx_customer_ledger_reference_id ON customer_ledger_entries(reference_id);
        CREATE INDEX IF NOT EXISTS idx_customer_ledger_entry_type ON customer_ledger_entries(entry_type);

        -- Customer index on sales table
        CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales(customer_id);
        "#,
    },
    Migration {
        version: 6,
        name: "006_suppliers_purchasing_and_payables",
        up: r#"
        -- Counters for sequential supplier codes, purchases, and supplier payment receipts
        INSERT OR IGNORE INTO counters (name, value) VALUES ('supplier_code', 0);
        INSERT OR IGNORE INTO counters (name, value) VALUES ('purchase_number', 0);
        INSERT OR IGNORE INTO counters (name, value) VALUES ('supplier_payment_receipt', 0);

        -- Suppliers master table
        CREATE TABLE IF NOT EXISTS suppliers (
            id TEXT PRIMARY KEY CHECK(length(id) = 36),
            supplier_code TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            alternate_phone TEXT,
            email TEXT,
            address TEXT,
            notes TEXT,
            credit_limit INTEGER NOT NULL DEFAULT 0 CHECK(credit_limit >= 0),
            is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_code ON suppliers(supplier_code);
        CREATE INDEX IF NOT EXISTS idx_suppliers_phone ON suppliers(phone);
        CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name COLLATE NOCASE);
        CREATE INDEX IF NOT EXISTS idx_suppliers_is_active ON suppliers(is_active);

        -- Purchases header table
        CREATE TABLE IF NOT EXISTS purchases (
            id TEXT PRIMARY KEY CHECK(length(id) = 36),
            purchase_number TEXT NOT NULL UNIQUE,
            supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
            branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
            subtotal INTEGER NOT NULL CHECK(subtotal >= 0),
            discount INTEGER NOT NULL DEFAULT 0 CHECK(discount >= 0),
            total_amount INTEGER NOT NULL CHECK(total_amount >= 0),
            paid_amount INTEGER NOT NULL DEFAULT 0 CHECK(paid_amount >= 0),
            credit_amount INTEGER NOT NULL DEFAULT 0 CHECK(credit_amount >= 0),
            payment_status TEXT NOT NULL CHECK(payment_status IN ('PAID', 'PARTIALLY_PAID', 'UNPAID')),
            status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK(status IN ('COMPLETED', 'CANCELLED')),
            notes TEXT,
            performed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_purchases_number ON purchases(purchase_number);
        CREATE INDEX IF NOT EXISTS idx_purchases_supplier_id ON purchases(supplier_id);
        CREATE INDEX IF NOT EXISTS idx_purchases_branch_id ON purchases(branch_id);
        CREATE INDEX IF NOT EXISTS idx_purchases_payment_status ON purchases(payment_status);
        CREATE INDEX IF NOT EXISTS idx_purchases_created_at ON purchases(created_at);

        -- Purchase Lines item table
        CREATE TABLE IF NOT EXISTS purchase_lines (
            id TEXT PRIMARY KEY CHECK(length(id) = 36),
            purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
            product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
            product_name_snapshot TEXT NOT NULL,
            sku_snapshot TEXT NOT NULL,
            quantity INTEGER NOT NULL CHECK(quantity > 0),
            unit_cost INTEGER NOT NULL CHECK(unit_cost >= 0),
            discount INTEGER NOT NULL DEFAULT 0 CHECK(discount >= 0),
            line_total INTEGER NOT NULL CHECK(line_total >= 0),
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_purchase_lines_purchase_id ON purchase_lines(purchase_id);
        CREATE INDEX IF NOT EXISTS idx_purchase_lines_product_id ON purchase_lines(product_id);

        -- Supplier Ledger Entries (Append-only Auditable Financial Journal)
        CREATE TABLE IF NOT EXISTS supplier_ledger_entries (
            id TEXT PRIMARY KEY CHECK(length(id) = 36),
            supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
            reference_id TEXT,
            reference_number TEXT,
            entry_type TEXT NOT NULL CHECK(entry_type IN ('PURCHASE', 'PAYMENT', 'ADJUSTMENT')),
            debit INTEGER NOT NULL DEFAULT 0 CHECK(debit >= 0),
            credit INTEGER NOT NULL DEFAULT 0 CHECK(credit >= 0),
            balance_after INTEGER NOT NULL CHECK(balance_after >= 0),
            description TEXT NOT NULL,
            performed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_supplier_ledger_supplier_id ON supplier_ledger_entries(supplier_id);
        CREATE INDEX IF NOT EXISTS idx_supplier_ledger_created_at ON supplier_ledger_entries(created_at);
        CREATE INDEX IF NOT EXISTS idx_supplier_ledger_reference_id ON supplier_ledger_entries(reference_id);
        CREATE INDEX IF NOT EXISTS idx_supplier_ledger_entry_type ON supplier_ledger_entries(entry_type);
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

        // 1. First run applies migrations (6 total: Core, Product/Inventory, Auth Security, Sales/Invoices, Customers/Ledger, Suppliers/Purchasing)
        let count = MigrationRunner::run(&mut conn).unwrap();
        assert_eq!(count, 6);

        // Verify permanent tables exist (5 from Phase 6 + 6 from Phase 7 + 4 from Phase 14 + 2 from Phase 15 + 4 from Phase 16 = 21 tables)
        let tables_count: i64 = conn
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN (
                    'organizations', 'branches', 'users', 'user_access_profiles', 'public_rates',
                    'categories', 'brands', 'units', 'products', 'stock', 'stock_movements',
                    'counters', 'sales', 'sale_lines', 'sale_payments',
                    'customers', 'customer_ledger_entries',
                    'suppliers', 'purchases', 'purchase_lines', 'supplier_ledger_entries'
                )",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(tables_count, 21);

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

    #[test]
    fn test_migration_004_sales_schema() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();

        MigrationRunner::run(&mut conn).unwrap();

        // 1. Verify counters table exists and has initial 'invoice' row
        let counter_val: i64 = conn
            .query_row("SELECT value FROM counters WHERE name = 'invoice'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(counter_val, 0);

        // 2. Verify sales table columns
        let sales_cols: Vec<String> = {
            let mut stmt = conn.prepare("PRAGMA table_info(sales)").unwrap();
            stmt.query_map([], |row| row.get(1))
                .unwrap()
                .filter_map(|r| r.ok())
                .collect()
        };
        assert!(sales_cols.contains(&"invoice_number".to_string()));
        assert!(sales_cols.contains(&"branch_id".to_string()));
        assert!(sales_cols.contains(&"subtotal".to_string()));
        assert!(sales_cols.contains(&"total_amount".to_string()));
        assert!(sales_cols.contains(&"paid_amount".to_string()));
        assert!(sales_cols.contains(&"payment_status".to_string()));
        assert!(sales_cols.contains(&"sale_status".to_string()));

        // 3. Verify unique constraint on invoice_number
        conn.execute(
            "INSERT INTO sales (id, invoice_number, branch_id, subtotal, discount, tax_amount, total_amount, paid_amount, change_amount, payment_status, sale_status, created_at, updated_at)
             VALUES ('11111111-1111-1111-1111-111111111111', 'INV-000001', '00000000-0000-0000-0000-000000000002', 1000, 0, 0, 1000, 1000, 0, 'PAID', 'COMPLETED', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        ).unwrap();

        // Inserting duplicate invoice_number must fail
        let dup_res = conn.execute(
            "INSERT INTO sales (id, invoice_number, branch_id, subtotal, discount, tax_amount, total_amount, paid_amount, change_amount, payment_status, sale_status, created_at, updated_at)
             VALUES ('22222222-2222-2222-2222-222222222222', 'INV-000001', '00000000-0000-0000-0000-000000000002', 1000, 0, 0, 1000, 1000, 0, 'PAID', 'COMPLETED', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        );
        assert!(dup_res.is_err(), "Duplicate invoice_number must be rejected by UNIQUE constraint");

        // 4. Verify sale_lines table & foreign key with valid 36-char UUIDs
        conn.execute(
            "INSERT INTO categories (id, name, code, is_active, created_at, updated_at)
             VALUES ('00000000-0000-0000-0000-000000000010', 'Cat', 'CAT1', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO units (id, name, is_active, created_at, updated_at)
             VALUES ('00000000-0000-0000-0000-000000000020', 'Piece', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO products (id, name, sku, category_id, unit_id, purchase_price, sale_price, is_active, created_at, updated_at)
             VALUES ('00000000-0000-0000-0000-000000000030', 'Item 1', 'SKU-1', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000020', 500, 1000, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        ).unwrap();

        conn.execute(
            "INSERT INTO sale_lines (id, sale_id, product_id, product_name_snapshot, sku_snapshot, unit_price, cost_price_snapshot, quantity, discount, line_total, created_at)
             VALUES ('00000000-0000-0000-0000-000000000040', '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000030', 'Item 1', 'SKU-1', 1000, 500, 1, 0, 1000, '2026-01-01T00:00:00Z')",
            [],
        ).unwrap();

        // 5. Verify sale_payments table & foreign key with valid 36-char UUIDs
        conn.execute(
            "INSERT INTO sale_payments (id, sale_id, amount, payment_method, created_at)
             VALUES ('00000000-0000-0000-0000-000000000050', '11111111-1111-1111-1111-111111111111', 1000, 'CASH', '2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
    }

    #[test]
    fn test_migration_005_customers_and_ledger() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();

        MigrationRunner::run(&mut conn).unwrap();

        // 1. Verify counters for customer_code and payment_receipt
        let cus_counter: i64 = conn
            .query_row("SELECT value FROM counters WHERE name = 'customer_code'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(cus_counter, 0);

        let rec_counter: i64 = conn
            .query_row("SELECT value FROM counters WHERE name = 'payment_receipt'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(rec_counter, 0);

        // 2. Verify customers table insert & constraints
        conn.execute(
            "INSERT INTO customers (id, customer_code, name, phone, credit_limit, is_active, created_at, updated_at)
             VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'CUS-000001', 'Ali Khan', '03001234567', 50000, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        ).unwrap();

        // Unique constraint on customer_code
        let dup_code = conn.execute(
            "INSERT INTO customers (id, customer_code, name, phone, credit_limit, is_active, created_at, updated_at)
             VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'CUS-000001', 'Bilal', '03009876543', 0, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        );
        assert!(dup_code.is_err(), "Duplicate customer_code must fail");

        // 3. Verify customer_ledger_entries insert & foreign key
        conn.execute(
            "INSERT INTO customer_ledger_entries (id, customer_id, reference_id, reference_number, entry_type, debit, credit, balance_after, description, created_at)
             VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'INV-000001', 'SALE', 10000, 0, 10000, 'Credit Sale INV-000001', '2026-01-01T00:00:00Z')",
            [],
        ).unwrap();

        // Verify balance query SUM(debit) - SUM(credit)
        let balance: i64 = conn.query_row(
            "SELECT COALESCE(SUM(debit) - SUM(credit), 0) FROM customer_ledger_entries WHERE customer_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'",
            [],
            |r| r.get(0),
        ).unwrap();
        assert_eq!(balance, 10000);
    }

    #[test]
    fn test_migration_006_suppliers_and_purchases() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();

        MigrationRunner::run(&mut conn).unwrap();

        // 1. Verify counters for supplier_code, purchase_number, supplier_payment_receipt
        let sup_counter: i64 = conn
            .query_row("SELECT value FROM counters WHERE name = 'supplier_code'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(sup_counter, 0);

        let pur_counter: i64 = conn
            .query_row("SELECT value FROM counters WHERE name = 'purchase_number'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(pur_counter, 0);

        let pay_counter: i64 = conn
            .query_row("SELECT value FROM counters WHERE name = 'supplier_payment_receipt'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(pay_counter, 0);

        // 2. Verify suppliers table insert & unique constraint
        conn.execute(
            "INSERT INTO suppliers (id, supplier_code, name, phone, credit_limit, is_active, created_at, updated_at)
             VALUES ('11111111-2222-3333-4444-555555555555', 'SUP-000001', 'Samsung Wholesaler', '03111234567', 100000, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        ).unwrap();

        let dup_code = conn.execute(
            "INSERT INTO suppliers (id, supplier_code, name, phone, credit_limit, is_active, created_at, updated_at)
             VALUES ('22222222-3333-4444-5555-666666666666', 'SUP-000001', 'Another Supplier', '03221234567', 0, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        );
        assert!(dup_code.is_err(), "Duplicate supplier_code must fail");

        // 3. Verify purchases table insert & foreign keys
        conn.execute(
            "INSERT INTO purchases (id, purchase_number, supplier_id, branch_id, subtotal, discount, total_amount, paid_amount, credit_amount, payment_status, status, created_at, updated_at)
             VALUES ('33333333-4444-5555-6666-777777777777', 'PUR-000001', '11111111-2222-3333-4444-555555555555', '00000000-0000-0000-0000-000000000002', 50000, 0, 50000, 20000, 30000, 'PARTIALLY_PAID', 'COMPLETED', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        ).unwrap();

        // 4. Verify supplier_ledger_entries insert & balance
        conn.execute(
            "INSERT INTO supplier_ledger_entries (id, supplier_id, reference_id, reference_number, entry_type, debit, credit, balance_after, description, created_at)
             VALUES ('44444444-5555-6666-7777-888888888888', '11111111-2222-3333-4444-555555555555', '33333333-4444-5555-6666-777777777777', 'PUR-000001', 'PURCHASE', 30000, 0, 30000, 'Credit Purchase PUR-000001', '2026-01-01T00:00:00Z')",
            [],
        ).unwrap();

        let payable_balance: i64 = conn.query_row(
            "SELECT COALESCE(SUM(debit) - SUM(credit), 0) FROM supplier_ledger_entries WHERE supplier_id = '11111111-2222-3333-4444-555555555555'",
            [],
            |r| r.get(0),
        ).unwrap();
        assert_eq!(payable_balance, 30000);
    }
}
