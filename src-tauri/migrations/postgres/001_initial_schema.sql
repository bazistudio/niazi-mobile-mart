-- PostgreSQL Schema Migration for Niazi Mobile Mart
-- Mirrored directly from canonical SQLite schema (migrations.rs 001 to 010)
-- 1 money unit = 1 PKR (stored as BIGINT / i64)

-- 001_initial_core_schema
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INT PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY CHECK(length(id) = 36),
    name TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'PKR',
    currency_symbol TEXT NOT NULL DEFAULT 'Rs',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

INSERT INTO organizations (id, name, currency, currency_symbol, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000001', 'Niazi Mobile Mart', 'PKR', 'Rs', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS branches (
    id TEXT PRIMARY KEY CHECK(length(id) = 36),
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    is_active INT NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

INSERT INTO branches (id, organization_id, name, code, is_active, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Main Branch', 'MAIN', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY CHECK(length(id) = 36),
    branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    login_key_hash TEXT NOT NULL,
    pin_hash TEXT,
    role TEXT NOT NULL,
    is_active INT NOT NULL DEFAULT 1,
    failed_pin_attempts INT NOT NULL DEFAULT 0,
    pin_locked_until_ms BIGINT,
    failed_login_attempts INT NOT NULL DEFAULT 0,
    login_locked_until_ms BIGINT,
    recovery_key_hash TEXT,
    must_change_password INT NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_branch_id ON users(branch_id);

CREATE TABLE IF NOT EXISTS user_access_profiles (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    allowed_pages TEXT NOT NULL,
    allowed_actions TEXT NOT NULL,
    max_discount_percent DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    can_price_override INT NOT NULL DEFAULT 0,
    can_refund INT NOT NULL DEFAULT 0,
    can_void_sale INT NOT NULL DEFAULT 0,
    can_view_profit INT NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public_rates (
    product_id TEXT PRIMARY KEY CHECK(length(product_id) = 36),
    product_name TEXT NOT NULL,
    category TEXT NOT NULL,
    selling_rate BIGINT NOT NULL CHECK(selling_rate >= 0),
    currency TEXT NOT NULL DEFAULT 'PKR',
    is_public INT NOT NULL DEFAULT 1,
    published_by TEXT REFERENCES users(id),
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_public_rates_is_public ON public_rates(is_public);

-- 002_product_and_inventory_schema
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY CHECK(length(id) = 36),
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active INT NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS brands (
    id TEXT PRIMARY KEY CHECK(length(id) = 36),
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active INT NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS units (
    id TEXT PRIMARY KEY CHECK(length(id) = 36),
    name TEXT NOT NULL,
    symbol TEXT,
    conversion_factor INT NOT NULL DEFAULT 1 CHECK(conversion_factor >= 1),
    is_active INT NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY CHECK(length(id) = 36),
    name TEXT NOT NULL,
    sku TEXT NOT NULL UNIQUE,
    barcode TEXT UNIQUE,
    category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    brand_id TEXT REFERENCES brands(id) ON DELETE SET NULL,
    unit_id TEXT REFERENCES units(id) ON DELETE RESTRICT,
    purchase_price BIGINT NOT NULL CHECK(purchase_price >= 0),
    average_cost BIGINT NOT NULL DEFAULT 0 CHECK(average_cost >= 0),
    sale_price BIGINT NOT NULL CHECK(sale_price >= 0),
    low_stock_threshold BIGINT NOT NULL DEFAULT 5 CHECK(low_stock_threshold >= 0),
    is_active INT NOT NULL DEFAULT 1,
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

CREATE TABLE IF NOT EXISTS stock (
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    quantity BIGINT NOT NULL DEFAULT 0 CHECK(quantity >= 0),
    updated_at TEXT NOT NULL,
    PRIMARY KEY (product_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_branch_id ON stock(branch_id);

CREATE TABLE IF NOT EXISTS stock_movements (
    id TEXT PRIMARY KEY CHECK(length(id) = 36),
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    movement_type TEXT NOT NULL CHECK(movement_type IN ('IN', 'OUT', 'ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT')),
    quantity BIGINT NOT NULL CHECK(quantity > 0),
    previous_stock BIGINT NOT NULL CHECK(previous_stock >= 0),
    resulting_stock BIGINT NOT NULL CHECK(resulting_stock >= 0),
    reason TEXT,
    performed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    reference_id TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_branch ON stock_movements(branch_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements(created_at);

-- 004_sales_and_invoices_schema & 005 & 006 & 007 & 008 counters
CREATE TABLE IF NOT EXISTS counters (
    name TEXT PRIMARY KEY,
    value BIGINT NOT NULL DEFAULT 0
);

INSERT INTO counters (name, value) VALUES
    ('invoice', 0),
    ('customer_code', 0),
    ('payment_receipt', 0),
    ('supplier_code', 0),
    ('purchase_number', 0),
    ('supplier_payment_receipt', 0),
    ('expense_number', 0),
    ('sales_return_number', 0),
    ('purchase_return_number', 0)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY CHECK(length(id) = 36),
    invoice_number TEXT NOT NULL UNIQUE,
    branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    customer_id TEXT,
    customer_name_snapshot TEXT,
    subtotal BIGINT NOT NULL CHECK(subtotal >= 0),
    discount BIGINT NOT NULL DEFAULT 0 CHECK(discount >= 0),
    tax_amount BIGINT NOT NULL DEFAULT 0 CHECK(tax_amount >= 0),
    total_amount BIGINT NOT NULL CHECK(total_amount >= 0),
    paid_amount BIGINT NOT NULL CHECK(paid_amount >= 0),
    change_amount BIGINT NOT NULL DEFAULT 0 CHECK(change_amount >= 0),
    payment_status TEXT NOT NULL CHECK(payment_status IN ('PAID', 'PARTIALLY_PAID', 'UNPAID')),
    sale_status TEXT NOT NULL CHECK(sale_status IN ('COMPLETED', 'VOIDED', 'REFUNDED')),
    performed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sales_branch_id ON sales(branch_id);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_sale_status ON sales(sale_status);

CREATE TABLE IF NOT EXISTS sale_lines (
    id TEXT PRIMARY KEY CHECK(length(id) = 36),
    sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    product_name_snapshot TEXT NOT NULL,
    sku_snapshot TEXT NOT NULL,
    unit_price BIGINT NOT NULL CHECK(unit_price >= 0),
    cost_price_snapshot BIGINT NOT NULL DEFAULT 0 CHECK(cost_price_snapshot >= 0),
    quantity BIGINT NOT NULL CHECK(quantity > 0),
    discount BIGINT NOT NULL DEFAULT 0 CHECK(discount >= 0),
    line_total BIGINT NOT NULL CHECK(line_total >= 0),
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sale_lines_sale_id ON sale_lines(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_lines_product_id ON sale_lines(product_id);

CREATE TABLE IF NOT EXISTS sale_payments (
    id TEXT PRIMARY KEY CHECK(length(id) = 36),
    sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    amount BIGINT NOT NULL CHECK(amount > 0),
    payment_method TEXT NOT NULL CHECK(payment_method IN ('CASH', 'CARD', 'BANK_TRANSFER', 'OTHER')),
    reference_number TEXT,
    notes TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sale_payments_sale_id ON sale_payments(sale_id);

-- 005_customers_and_ledger
CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY CHECK(length(id) = 36),
    customer_code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    alternate_phone TEXT,
    email TEXT,
    address TEXT,
    notes TEXT,
    credit_limit BIGINT NOT NULL DEFAULT 0 CHECK(credit_limit >= 0),
    is_active INT NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_is_active ON customers(is_active);

CREATE TABLE IF NOT EXISTS customer_ledger_entries (
    id TEXT PRIMARY KEY CHECK(length(id) = 36),
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    reference_id TEXT,
    reference_number TEXT,
    entry_type TEXT NOT NULL CHECK(entry_type IN ('SALE', 'PAYMENT', 'ADJUSTMENT')),
    debit BIGINT NOT NULL DEFAULT 0 CHECK(debit >= 0),
    credit BIGINT NOT NULL DEFAULT 0 CHECK(credit >= 0),
    balance_after BIGINT NOT NULL CHECK(balance_after >= 0),
    description TEXT NOT NULL,
    performed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customer_ledger_customer_id ON customer_ledger_entries(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_ledger_created_at ON customer_ledger_entries(created_at);
CREATE INDEX IF NOT EXISTS idx_customer_ledger_reference_id ON customer_ledger_entries(reference_id);
CREATE INDEX IF NOT EXISTS idx_customer_ledger_entry_type ON customer_ledger_entries(entry_type);

CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales(customer_id);

-- 006_suppliers_purchasing_and_payables
CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY CHECK(length(id) = 36),
    supplier_code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    alternate_phone TEXT,
    email TEXT,
    address TEXT,
    notes TEXT,
    credit_limit BIGINT NOT NULL DEFAULT 0 CHECK(credit_limit >= 0),
    is_active INT NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_suppliers_phone ON suppliers(phone);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
CREATE INDEX IF NOT EXISTS idx_suppliers_is_active ON suppliers(is_active);

CREATE TABLE IF NOT EXISTS purchases (
    id TEXT PRIMARY KEY CHECK(length(id) = 36),
    purchase_number TEXT NOT NULL UNIQUE,
    supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    subtotal BIGINT NOT NULL CHECK(subtotal >= 0),
    discount BIGINT NOT NULL DEFAULT 0 CHECK(discount >= 0),
    total_amount BIGINT NOT NULL CHECK(total_amount >= 0),
    paid_amount BIGINT NOT NULL DEFAULT 0 CHECK(paid_amount >= 0),
    credit_amount BIGINT NOT NULL DEFAULT 0 CHECK(credit_amount >= 0),
    payment_status TEXT NOT NULL CHECK(payment_status IN ('PAID', 'PARTIALLY_PAID', 'UNPAID')),
    status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK(status IN ('COMPLETED', 'CANCELLED')),
    notes TEXT,
    performed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_purchases_supplier_id ON purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_branch_id ON purchases(branch_id);
CREATE INDEX IF NOT EXISTS idx_purchases_payment_status ON purchases(payment_status);
CREATE INDEX IF NOT EXISTS idx_purchases_created_at ON purchases(created_at);

CREATE TABLE IF NOT EXISTS purchase_lines (
    id TEXT PRIMARY KEY CHECK(length(id) = 36),
    purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    product_name_snapshot TEXT NOT NULL,
    sku_snapshot TEXT NOT NULL,
    quantity BIGINT NOT NULL CHECK(quantity > 0),
    unit_cost BIGINT NOT NULL CHECK(unit_cost >= 0),
    discount BIGINT NOT NULL DEFAULT 0 CHECK(discount >= 0),
    line_total BIGINT NOT NULL CHECK(line_total >= 0),
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_purchase_lines_purchase_id ON purchase_lines(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_lines_product_id ON purchase_lines(product_id);

CREATE TABLE IF NOT EXISTS supplier_ledger_entries (
    id TEXT PRIMARY KEY CHECK(length(id) = 36),
    supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    reference_id TEXT,
    reference_number TEXT,
    entry_type TEXT NOT NULL CHECK(entry_type IN ('PURCHASE', 'PAYMENT', 'ADJUSTMENT')),
    debit BIGINT NOT NULL DEFAULT 0 CHECK(debit >= 0),
    credit BIGINT NOT NULL DEFAULT 0 CHECK(credit >= 0),
    balance_after BIGINT NOT NULL CHECK(balance_after >= 0),
    description TEXT NOT NULL,
    performed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_supplier_ledger_supplier_id ON supplier_ledger_entries(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_ledger_created_at ON supplier_ledger_entries(created_at);
CREATE INDEX IF NOT EXISTS idx_supplier_ledger_reference_id ON supplier_ledger_entries(reference_id);
CREATE INDEX IF NOT EXISTS idx_supplier_ledger_entry_type ON supplier_ledger_entries(entry_type);

-- 007_cash_management_and_daily_closing
CREATE TABLE IF NOT EXISTS expense_categories (
    id TEXT PRIMARY KEY CHECK(length(id) = 36),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active INT NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_expense_categories_is_active ON expense_categories(is_active);

INSERT INTO expense_categories (id, name, description, is_active, created_at, updated_at) VALUES
    ('e0000001-0000-0000-0000-000000000001', 'Rent', 'Store rent and premises lease', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ('e0000001-0000-0000-0000-000000000002', 'Electricity', 'Electricity bills and power charges', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ('e0000001-0000-0000-0000-000000000003', 'Internet', 'Broadband and mobile data communication', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ('e0000001-0000-0000-0000-000000000004', 'Staff Salary', 'Employee salaries, wages, and bonuses', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ('e0000001-0000-0000-0000-000000000005', 'Transport', 'Logistics, delivery, and travel expenses', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ('e0000001-0000-0000-0000-000000000006', 'Maintenance', 'Shop repairs, equipment and tool upkeep', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ('e0000001-0000-0000-0000-000000000007', 'Office Supplies', 'Packaging, stationery, and store supplies', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ('e0000001-0000-0000-0000-000000000008', 'Miscellaneous', 'General sundry and tea/refreshments', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY CHECK(length(id) = 36),
    expense_number TEXT NOT NULL UNIQUE,
    category_id TEXT NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
    branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    amount BIGINT NOT NULL CHECK(amount > 0),
    payment_method TEXT NOT NULL,
    description TEXT NOT NULL,
    notes TEXT,
    expense_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK(status IN ('COMPLETED', 'CANCELLED')),
    performed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_branch_id ON expenses(branch_id);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON expenses(created_at);

CREATE TABLE IF NOT EXISTS cash_sessions (
    id TEXT PRIMARY KEY CHECK(length(id) = 36),
    branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    business_date TEXT NOT NULL,
    opening_cash BIGINT NOT NULL DEFAULT 0 CHECK(opening_cash >= 0),
    expected_closing_cash BIGINT,
    actual_closing_cash BIGINT,
    cash_variance BIGINT,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'CLOSED')),
    opened_at TEXT NOT NULL,
    closed_at TEXT,
    opened_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    closed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_open_session_per_branch ON cash_sessions(branch_id) WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS idx_cash_sessions_branch_id ON cash_sessions(branch_id);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_business_date ON cash_sessions(business_date);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_status ON cash_sessions(status);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_opened_at ON cash_sessions(opened_at);

CREATE TABLE IF NOT EXISTS cash_movements (
    id TEXT PRIMARY KEY CHECK(length(id) = 36),
    session_id TEXT REFERENCES cash_sessions(id) ON DELETE SET NULL,
    branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    movement_type TEXT NOT NULL CHECK(movement_type IN ('SALE_PAYMENT', 'CUSTOMER_PAYMENT', 'SUPPLIER_PAYMENT', 'EXPENSE', 'CASH_ADJUSTMENT')),
    direction TEXT NOT NULL CHECK(direction IN ('IN', 'OUT')),
    amount BIGINT NOT NULL CHECK(amount > 0),
    reference_id TEXT,
    reference_number TEXT,
    payment_method TEXT NOT NULL DEFAULT 'CASH',
    description TEXT NOT NULL,
    performed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cash_movements_session_id ON cash_movements(session_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_branch_id ON cash_movements(branch_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_type ON cash_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_cash_movements_direction ON cash_movements(direction);
CREATE INDEX IF NOT EXISTS idx_cash_movements_created_at ON cash_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_cash_movements_reference_id ON cash_movements(reference_id);

-- 008_returns_and_stock_reversal
CREATE TABLE IF NOT EXISTS sales_returns (
    id TEXT PRIMARY KEY CHECK(length(id) = 36),
    return_number TEXT NOT NULL UNIQUE,
    sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
    branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
    customer_name_snapshot TEXT,
    total_amount BIGINT NOT NULL CHECK(total_amount > 0),
    refund_method TEXT NOT NULL CHECK(refund_method IN ('CASH', 'CUSTOMER_CREDIT')),
    status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK(status IN ('COMPLETED', 'CANCELLED')),
    reason TEXT,
    notes TEXT,
    performed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sales_returns_sale_id ON sales_returns(sale_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_branch_id ON sales_returns(branch_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_customer_id ON sales_returns(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_created_at ON sales_returns(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_returns_status ON sales_returns(status);

CREATE TABLE IF NOT EXISTS sales_return_lines (
    id TEXT PRIMARY KEY CHECK(length(id) = 36),
    return_id TEXT NOT NULL REFERENCES sales_returns(id) ON DELETE CASCADE,
    sale_line_id TEXT NOT NULL REFERENCES sale_lines(id) ON DELETE RESTRICT,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    product_name_snapshot TEXT NOT NULL,
    sku_snapshot TEXT NOT NULL,
    unit_price BIGINT NOT NULL CHECK(unit_price >= 0),
    quantity BIGINT NOT NULL CHECK(quantity > 0),
    return_amount BIGINT NOT NULL CHECK(return_amount >= 0),
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sales_return_lines_return_id ON sales_return_lines(return_id);
CREATE INDEX IF NOT EXISTS idx_sales_return_lines_sale_line_id ON sales_return_lines(sale_line_id);
CREATE INDEX IF NOT EXISTS idx_sales_return_lines_product_id ON sales_return_lines(product_id);

CREATE TABLE IF NOT EXISTS purchase_returns (
    id TEXT PRIMARY KEY CHECK(length(id) = 36),
    return_number TEXT NOT NULL UNIQUE,
    purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE RESTRICT,
    branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    supplier_id TEXT REFERENCES suppliers(id) ON DELETE RESTRICT,
    supplier_name_snapshot TEXT,
    total_amount BIGINT NOT NULL CHECK(total_amount > 0),
    settlement_method TEXT NOT NULL CHECK(settlement_method IN ('CASH', 'SUPPLIER_CREDIT')),
    status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK(status IN ('COMPLETED', 'CANCELLED')),
    reason TEXT,
    notes TEXT,
    performed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_purchase_returns_purchase_id ON purchase_returns(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_branch_id ON purchase_returns(branch_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_supplier_id ON purchase_returns(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_created_at ON purchase_returns(created_at);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_status ON purchase_returns(status);

CREATE TABLE IF NOT EXISTS purchase_return_lines (
    id TEXT PRIMARY KEY CHECK(length(id) = 36),
    return_id TEXT NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
    purchase_line_id TEXT NOT NULL REFERENCES purchase_lines(id) ON DELETE RESTRICT,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    product_name_snapshot TEXT NOT NULL,
    sku_snapshot TEXT NOT NULL,
    unit_cost BIGINT NOT NULL CHECK(unit_cost >= 0),
    quantity BIGINT NOT NULL CHECK(quantity > 0),
    return_amount BIGINT NOT NULL CHECK(return_amount >= 0),
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_purchase_return_lines_return_id ON purchase_return_lines(return_id);
CREATE INDEX IF NOT EXISTS idx_purchase_return_lines_purchase_line_id ON purchase_return_lines(purchase_line_id);
CREATE INDEX IF NOT EXISTS idx_purchase_return_lines_product_id ON purchase_return_lines(product_id);
