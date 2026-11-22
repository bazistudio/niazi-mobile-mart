-- Migration 050: Direct Advance Voucher Foundation & Inventory Reconciliation Schema
--
-- Business Objective:
-- Establishes the database foundation for the Direct Advance Voucher system integrated
-- with Product POS. Allows customer transactions with immediate physical product delivery
-- even when goods are sourced directly from the market or added instantly into inventory stock.
--
-- Guarantees:
-- 1. Locked Purchase Price (immutable cost basis snapshot)
-- 2. Custom Voucher Selling Price (independent of catalog sale_price)
-- 3. Catalog Sale Price Benchmark (preserves inventory shelf price separately)
-- 4. Voucher Type Classification (INSTANT_INVENTORY, DIRECT_ADVANCE, PRE_BOOKING)
-- 5. Immediate Delivery with Inventory Tracking
-- 6. Five Product Specifications Historical Snapshot (category, quality, color, brand, company)
-- 7. Full Reconciliation Audit Trail (pos_voucher_inventory_matches) for 10-in / 2-voucher / 8-stock
-- 8. Cost Discrepancy Recording without silent cost overwrites
--
-- Safe and Idempotent:
-- Uses IF NOT EXISTS and non-destructive check constraints.

-- -----------------------------------------------------------------------------
-- 1. pos_direct_vouchers
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_direct_vouchers (
    id                      TEXT PRIMARY KEY CHECK(length(id) = 36),
    voucher_number          VARCHAR(50) NOT NULL UNIQUE,
    voucher_type            VARCHAR(30) NOT NULL DEFAULT 'INSTANT_INVENTORY'
                            CHECK(voucher_type IN ('INSTANT_INVENTORY', 'DIRECT_ADVANCE', 'PRE_BOOKING')),
    organization_id         TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    branch_id               TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    customer_id             TEXT REFERENCES customers(id) ON DELETE RESTRICT,
    customer_name_snapshot  TEXT NOT NULL,
    customer_phone_snapshot TEXT,
    
    -- Product Identity & Specification Snapshots
    product_id              TEXT REFERENCES products(id) ON DELETE RESTRICT,
    product_name            TEXT NOT NULL CHECK(length(trim(product_name)) > 0),
    spec_category           TEXT,
    spec_quality            TEXT,
    spec_color              TEXT,
    spec_brand              TEXT,
    spec_company            TEXT,
    
    -- Quantities & Physical Delivery
    voucher_qty             INT NOT NULL CHECK(voucher_qty > 0),
    delivered_qty           INT NOT NULL CHECK(delivered_qty > 0 AND delivered_qty <= voucher_qty),
    matched_qty             INT NOT NULL DEFAULT 0 CHECK(matched_qty >= 0 AND matched_qty <= delivered_qty),
    remaining_qty           INT GENERATED ALWAYS AS (delivered_qty - matched_qty) STORED,
    
    -- Immutable Financial Snapshots (whole PKR rupees / BIGINT)
    locked_purchase_price   BIGINT NOT NULL CHECK(locked_purchase_price >= 0),
    catalog_sale_price      BIGINT CHECK(catalog_sale_price IS NULL OR catalog_sale_price >= 0),
    voucher_sale_price      BIGINT NOT NULL CHECK(voucher_sale_price >= 0),
    total_sale_amount       BIGINT GENERATED ALWAYS AS (voucher_qty * voucher_sale_price) STORED,
    
    -- Transaction & Accounting Linkage
    payment_method          VARCHAR(20) NOT NULL CHECK(payment_method IN ('CASH', 'BANK', 'EASYPAISA', 'JAZZCASH', 'CREDIT')),
    payment_status          VARCHAR(20) NOT NULL CHECK(payment_status IN ('PAID', 'ON_ACCOUNT', 'PARTIALLY_PAID', 'UNPAID')),
    paid_amount             BIGINT NOT NULL DEFAULT 0 CHECK(paid_amount >= 0),
    cash_movement_id        TEXT REFERENCES cash_movements(id) ON DELETE SET NULL,
    customer_ledger_id      TEXT REFERENCES customer_ledger_entries(id) ON DELETE SET NULL,
    
    -- Status & Lifecycle
    status                  VARCHAR(30) NOT NULL DEFAULT 'PENDING_RECEIPT'
                            CHECK(status IN ('PENDING_RECEIPT', 'PARTIALLY_MATCHED', 'FULFILLED', 'CANCELLED')),
    
    notes                   TEXT,
    performed_by            TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at              TEXT NOT NULL,
    updated_at              TEXT NOT NULL
);

-- Indexes for performance and isolation
CREATE INDEX IF NOT EXISTS idx_pos_direct_vouchers_branch_status
    ON pos_direct_vouchers (branch_id, status);

CREATE INDEX IF NOT EXISTS idx_pos_direct_vouchers_org_branch
    ON pos_direct_vouchers (organization_id, branch_id);

CREATE INDEX IF NOT EXISTS idx_pos_direct_vouchers_type
    ON pos_direct_vouchers (voucher_type);

CREATE INDEX IF NOT EXISTS idx_pos_direct_vouchers_customer
    ON pos_direct_vouchers (customer_id);

CREATE INDEX IF NOT EXISTS idx_pos_direct_vouchers_product
    ON pos_direct_vouchers (product_id);

CREATE INDEX IF NOT EXISTS idx_pos_direct_vouchers_created_at
    ON pos_direct_vouchers (created_at);

-- -----------------------------------------------------------------------------
-- 2. pos_voucher_inventory_matches
-- Permanent audit trail linking inventory receipts to fulfilled voucher units
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_voucher_inventory_matches (
    id                      TEXT PRIMARY KEY CHECK(length(id) = 36),
    organization_id         TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    voucher_id              TEXT NOT NULL REFERENCES pos_direct_vouchers(id) ON DELETE RESTRICT,
    purchase_id             TEXT REFERENCES purchases(id) ON DELETE RESTRICT,
    purchase_line_id        TEXT REFERENCES purchase_lines(id) ON DELETE RESTRICT,
    stock_movement_in_id    TEXT REFERENCES stock_movements(id) ON DELETE RESTRICT,
    stock_movement_out_id   TEXT REFERENCES stock_movements(id) ON DELETE RESTRICT,
    branch_id               TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    product_id              TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    
    -- Reconciliation Quantities
    quantity_matched        INT NOT NULL CHECK(quantity_matched > 0),
    
    -- Cost Comparison & Discrepancy Tracking (whole PKR rupees)
    locked_unit_cost        BIGINT NOT NULL CHECK(locked_unit_cost >= 0),
    actual_receiving_cost   BIGINT NOT NULL CHECK(actual_receiving_cost >= 0),
    unit_cost_discrepancy   BIGINT GENERATED ALWAYS AS (actual_receiving_cost - locked_unit_cost) STORED,
    total_cost_discrepancy  BIGINT GENERATED ALWAYS AS (quantity_matched * (actual_receiving_cost - locked_unit_cost)) STORED,
    
    -- Operational & Audit Tracking
    reconciliation_notes    TEXT,
    matched_by              TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at              TEXT NOT NULL
);

-- Indexes for matching queries and audit traceability
CREATE INDEX IF NOT EXISTS idx_voucher_matches_voucher_id
    ON pos_voucher_inventory_matches (voucher_id);

CREATE INDEX IF NOT EXISTS idx_voucher_matches_purchase_id
    ON pos_voucher_inventory_matches (purchase_id);

CREATE INDEX IF NOT EXISTS idx_voucher_matches_org_branch
    ON pos_voucher_inventory_matches (organization_id, branch_id);

CREATE INDEX IF NOT EXISTS idx_voucher_matches_branch_product
    ON pos_voucher_inventory_matches (branch_id, product_id);

CREATE INDEX IF NOT EXISTS idx_voucher_matches_created_at
    ON pos_voucher_inventory_matches (created_at);
