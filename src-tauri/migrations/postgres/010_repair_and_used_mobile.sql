-- 010_repair_and_used_mobile.sql
-- Adds foundational tables for Repair Jobs and Used Mobile KYC Transactions

-- Repair Jobs
CREATE TABLE IF NOT EXISTS repair_jobs (
    id TEXT PRIMARY KEY CHECK(length(id) = 36),
    job_number TEXT NOT NULL UNIQUE,
    branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    customer_name_snapshot TEXT NOT NULL,
    device_brand TEXT NOT NULL,
    device_model TEXT NOT NULL,
    device_imei TEXT,
    problem_description TEXT NOT NULL,
    estimated_charges BIGINT NOT NULL CHECK(estimated_charges >= 0),
    final_charges BIGINT NOT NULL DEFAULT 0 CHECK(final_charges >= 0),
    paid_amount BIGINT NOT NULL DEFAULT 0 CHECK(paid_amount >= 0),
    status TEXT NOT NULL DEFAULT 'BOOKED' CHECK(status IN ('BOOKED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    notes TEXT,
    performed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_repair_jobs_branch_id ON repair_jobs(branch_id);
CREATE INDEX IF NOT EXISTS idx_repair_jobs_customer_id ON repair_jobs(customer_id);
CREATE INDEX IF NOT EXISTS idx_repair_jobs_status ON repair_jobs(status);
CREATE INDEX IF NOT EXISTS idx_repair_jobs_created_at ON repair_jobs(created_at);

INSERT INTO counters (name, value) VALUES ('repair_job_number', 0) ON CONFLICT (name) DO NOTHING;

-- Used Mobile Transactions
CREATE TABLE IF NOT EXISTS used_mobile_transactions (
    id TEXT PRIMARY KEY CHECK(length(id) = 36),
    transaction_number TEXT NOT NULL UNIQUE,
    branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    transaction_type TEXT NOT NULL CHECK(transaction_type IN ('PURCHASE_FROM_SELLER', 'SALE_TO_CUSTOMER')),
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    seller_name_snapshot TEXT NOT NULL,
    seller_cnic TEXT NOT NULL,
    seller_mobile TEXT NOT NULL,
    device_brand TEXT NOT NULL,
    device_model TEXT NOT NULL,
    device_imei_1 TEXT NOT NULL,
    device_imei_2 TEXT,
    device_condition TEXT NOT NULL,
    transaction_amount BIGINT NOT NULL CHECK(transaction_amount >= 0),
    payment_status TEXT NOT NULL DEFAULT 'PAID' CHECK(payment_status IN ('PAID', 'PARTIALLY_PAID', 'UNPAID')),
    status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK(status IN ('COMPLETED', 'CANCELLED')),
    notes TEXT,
    performed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_used_mobile_transactions_branch_id ON used_mobile_transactions(branch_id);
CREATE INDEX IF NOT EXISTS idx_used_mobile_transactions_customer_id ON used_mobile_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_used_mobile_transactions_type ON used_mobile_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_used_mobile_transactions_created_at ON used_mobile_transactions(created_at);

INSERT INTO counters (name, value) VALUES ('mobile_transaction_number', 0) ON CONFLICT (name) DO NOTHING;
